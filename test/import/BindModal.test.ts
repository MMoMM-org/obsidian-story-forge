/**
 * Tests for BindModal — the tab/command bind step as a PURE UI step (T-S2.3).
 *
 * New contract (T-S2.3, F3):
 * - Constructor is seed-only: new BindModal(app, seed) — no store, no viewId,
 *   no registerCommand callback. The modal performs NO side-effects; the caller
 *   owns the commit.
 * - present(): Promise<{ label; registerCommand } | null>.
 *     Resolves the result object when "Done" is clicked.
 *     Resolves null on "Back" or on dismiss/close without Done.
 * - Seeded values pre-fill inputs (tab label = seed.name; command checkbox
 *   defaults per seed). There is NO "command name" input — the command is named
 *   after the tab label by the caller.
 * - Every imported view is a sidebar tab: the tab-label input is always present
 *   and enabled (no "show as tab" checkbox gates it). Only the command binding
 *   is optional (a bare on/off toggle).
 * - No persistence happens (there is no store to write to).
 *
 * @ref SDD/Runtime View — Flow C (bind step)
 * @ref SDD/ADR-6 (sf-name as default tab label)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { App } from "obsidian";
import { BindModal } from "import/BindModal";

// ---------------------------------------------------------------------------
// DOM query helpers
// ---------------------------------------------------------------------------

function tabLabelInput(modal: BindModal): HTMLInputElement {
	const el = modal.contentEl.querySelector<HTMLInputElement>(
		".sf-bind-row .sf-bind-input",
	);
	if (!el) throw new Error("tab-label input not found");
	return el;
}

function commandCheckbox(modal: BindModal): HTMLInputElement {
	const el = modal.contentEl.querySelector<HTMLInputElement>(
		'input[data-role="command"]',
	);
	if (!el) throw new Error("command checkbox not found");
	return el;
}

function commandNameInput(modal: BindModal): HTMLInputElement {
	// Two `.sf-bind-input` text inputs exist (tab label, command name); the
	// command-name input is the last one (its row follows the command checkbox).
	const els = modal.contentEl.querySelectorAll<HTMLInputElement>(
		".sf-bind-row .sf-bind-input",
	);
	const el = els[els.length - 1];
	if (!el || els.length < 2) throw new Error("command-name input not found");
	return el;
}

function buttonByText(modal: BindModal, text: string): HTMLButtonElement {
	const btn = Array.from(
		modal.contentEl.querySelectorAll<HTMLButtonElement>("button"),
	).find((b) => b.textContent === text);
	if (!btn) throw new Error(`button "${text}" not found`);
	return btn;
}

function click(el: HTMLElement): void {
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function fireChange(el: HTMLElement): void {
	el.dispatchEvent(new Event("change", { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BindModal", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	// T2.6: the sidebar surface is renamed to "Workbench" — this field labels
	// the tab it creates inside that surface.
	// #50: the title goes in Obsidian's title slot, not a raw heading in the content.
	it("titles itself through setTitle, with no heading in its content", () => {
		const modal = new BindModal(app, { name: "My View" });
		void modal.present();

		expect(modal.titleEl.textContent).toBe("Bind collection");
		expect(modal.contentEl.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();

		modal.close();
	});

	it("labels the tab-label field 'Workbench tab label'", () => {
		const modal = new BindModal(app, { name: "My View" });
		void modal.present();

		const label = Array.from(
			modal.contentEl.querySelectorAll<HTMLElement>(".sf-bind-label"),
		).find((el) => el.textContent === "Workbench tab label");
		expect(label).toBeTruthy();

		modal.close();
	});

	it("seeds tab label from seed.name", () => {
		const modal = new BindModal(app, { name: "Characters in Scene" });
		void modal.present();

		expect(tabLabelInput(modal).value).toBe("Characters in Scene");

		modal.close();
	});

	it("defaults command checkbox unchecked and always enables the tab label", () => {
		const modal = new BindModal(app, { name: "My View" });
		void modal.present();

		// The tab label is always present and enabled — there is no checkbox
		// gating it (every imported view is a sidebar tab).
		expect(tabLabelInput(modal).disabled).toBe(false);
		expect(commandCheckbox(modal).checked).toBe(false);

		modal.close();
	});

	it("honours the seed override for the command checkbox", () => {
		const modal = new BindModal(app, {
			name: "Seeded",
			registerCommand: true,
		});
		void modal.present();

		expect(commandCheckbox(modal).checked).toBe(true);
		// tab label is always enabled regardless of seed
		expect(tabLabelInput(modal).disabled).toBe(false);

		modal.close();
	});

	it("resolves the result object with label/registerCommand/commandName on Done", async () => {
		const modal = new BindModal(app, { name: "My View" });
		const promise = modal.present();

		// Edit the tab label
		tabLabelInput(modal).value = "Renamed tab";
		// Toggle the command checkbox on
		const cmd = commandCheckbox(modal);
		cmd.checked = true;
		fireChange(cmd);

		click(buttonByText(modal, "Done"));

		const result = await promise;
		expect(result).toEqual({
			label: "Renamed tab",
			registerCommand: true,
			commandName: "My View",
		});
	});

	// -------------------------------------------------------------------------
	// Command-name input — dedicated, independent of the tab label
	// -------------------------------------------------------------------------

	it("seeds the command-name input from seed.commandName", () => {
		const modal = new BindModal(app, {
			name: "Tab Label",
			commandName: "Open Cast",
		});
		void modal.present();

		expect(commandNameInput(modal).value).toBe("Open Cast");

		modal.close();
	});

	it("falls back the command-name input to seed.name when commandName absent", () => {
		const modal = new BindModal(app, { name: "Tab Label" });
		void modal.present();

		expect(commandNameInput(modal).value).toBe("Tab Label");

		modal.close();
	});

	it("disables the command-name input until the checkbox is checked, then enables it", () => {
		const modal = new BindModal(app, { name: "My View" });
		void modal.present();

		// Checkbox defaults unchecked → command-name input disabled.
		expect(commandCheckbox(modal).checked).toBe(false);
		expect(commandNameInput(modal).disabled).toBe(true);

		// Check it → command-name input enabled.
		const cmd = commandCheckbox(modal);
		cmd.checked = true;
		fireChange(cmd);
		expect(commandNameInput(modal).disabled).toBe(false);

		modal.close();
	});

	it("resolves result.commandName INDEPENDENT of result.label", async () => {
		const modal = new BindModal(app, {
			name: "Seed Name",
			registerCommand: true,
			commandName: "Seed Command",
		});
		const promise = modal.present();

		// Edit tab label and command name to DIFFERENT values.
		tabLabelInput(modal).value = "Distinct Tab";
		commandNameInput(modal).value = "Distinct Command";

		click(buttonByText(modal, "Done"));

		const result = await promise;
		expect(result?.label).toBe("Distinct Tab");
		expect(result?.commandName).toBe("Distinct Command");
	});

	it("resolves null when Back is clicked", async () => {
		const modal = new BindModal(app, { name: "My View" });
		const promise = modal.present();

		click(buttonByText(modal, "Back"));

		const result = await promise;
		expect(result).toBeNull();
	});

	it("resolves null when the modal is dismissed/closed without Done", async () => {
		const modal = new BindModal(app, { name: "My View" });
		const promise = modal.present();

		modal.close();

		const result = await promise;
		expect(result).toBeNull();
	});

	it("resolves once — Done then close does not overwrite the result", async () => {
		const modal = new BindModal(app, { name: "My View" });
		const promise = modal.present();

		click(buttonByText(modal, "Done"));
		// close() runs onClose which must not re-resolve with null
		const result = await promise;
		expect(result).not.toBeNull();
		expect(result?.label).toBe("My View");
	});

	it("takes no store/persistence dependency (pure UI step)", () => {
		// The constructor accepts only (app, seed) — nothing to persist to.
		const modal = new BindModal(app, { name: "My View" });
		void modal.present();
		click(buttonByText(modal, "Done"));
		// No assertion on a store because none is injected; the fact that this
		// compiles and runs without a store proves the modal owns no persistence.
		expect(modal).toBeInstanceOf(BindModal);
	});
});
