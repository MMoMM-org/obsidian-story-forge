/**
 * undoControls — the shared ↶ ↷ controls of the Anvil and the Workbench (spec 009 T5.1).
 *
 * Markup, texts and the disabled rule are the signed-off mockups U1, U2, U4, U5.
 * Disabled is `aria-disabled="true"`, never the `disabled` attribute, so the tooltip stays
 * reachable (ADR-50). The controls follow `peek()` only; a busy probe does not disable them.
 *
 * @ref SDD/ADR-50, AC-F6.2, AC-F6.3, AC-F6.4
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	activateUndoControl, buildAnvilUndoControls, buildWorkbenchUndoControls, syncUndoControls,
	type UndoControlsJournal,
} from "undo/undoControls";
import type { StackPeek } from "undo/undoJournal";
import type { UndoOutcome } from "undo/journalTypes";
import { MARA, setup, teardownAndCheckUntouched } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

const summary = (label: string) => ({ label, fieldCount: 1, noteCount: 1 });
const peekOf = (undo: string | null, redo: string | null): StackPeek => ({
	undo: undo === null ? null : summary(undo),
	redo: redo === null ? null : summary(redo),
});
const EMPTY = peekOf(null, null);

const APPLIED = { kind: "applied" } as unknown as UndoOutcome;
const journalOf = (peek: StackPeek = EMPTY) => ({
	peek: vi.fn(() => peek),
	undo: vi.fn(() => Promise.resolve(APPLIED)),
	redo: vi.fn(() => Promise.resolve(APPLIED)),
}) satisfies UndoControlsJournal;

const anvil = () => {
	const head = document.createElement("div");
	const group = buildAnvilUndoControls(head);
	return { head, group, undo: group.children[0] as HTMLElement, redo: group.children[1] as HTMLElement };
};
const workbench = () => {
	const icons = document.createElement("div");
	icons.createEl("button", { cls: "sf-pin-btn" });
	const [undo, redo] = buildWorkbenchUndoControls(icons) as [HTMLElement, HTMLElement];
	return { icons, undo, redo };
};

describe("buildAnvilUndoControls", () => {
	it("appends div.sf-undo-group holding two focusable span role=button controls (U1)", () => {
		const { head, group, undo, redo } = anvil();
		expect(group.matches("div.sf-undo-group")).toBe(true);
		expect(head.lastElementChild).toBe(group);
		expect(group.children).toHaveLength(2);
		for (const [el, which, glyph] of [[undo, "undo", "↶"], [redo, "redo", "↷"]] as const) {
			expect(el.matches("span.sf-undo-tool[role=button][tabindex='0']")).toBe(true);
			expect(el.dataset["sfUndo"]).toBe(which);
			expect(el.textContent).toBe(glyph);
		}
	});

	it("starts disabled with the empty texts, as a fresh journal reads (U2b)", () => {
		const { undo, redo } = anvil();
		expect([undo.getAttribute("aria-disabled"), undo.title, undo.getAttribute("aria-label")]).toEqual(["true", "Nothing to undo", "Nothing to undo"]);
		expect([redo.getAttribute("aria-disabled"), redo.title, redo.getAttribute("aria-label")]).toEqual(["true", "Nothing to redo", "Nothing to redo"]);
	});
});

describe("buildWorkbenchUndoControls", () => {
	it("prepends two native button.sf-undo-btn before the existing icons (U4)", () => {
		const { icons, undo, redo } = workbench();
		expect(Array.from(icons.children)).toEqual([undo, redo, icons.querySelector(".sf-pin-btn")]);
		expect(undo.matches("button.sf-undo-btn")).toBe(true);
		expect(undo.dataset["sfUndo"]).toBe("undo");
		expect(redo.matches("button.sf-undo-btn")).toBe(true);
		expect(redo.dataset["sfUndo"]).toBe("redo");
		expect([undo.textContent, redo.textContent]).toEqual(["↶", "↷"]);
	});

	it("is a plain button that never submits, and starts disabled by aria only", () => {
		const { undo } = workbench();
		expect(undo.getAttribute("type")).toBe("button");
		expect(undo.getAttribute("aria-disabled")).toBe("true");
		expect(undo.hasAttribute("disabled")).toBe(false);
	});
});

describe.each([
	["Anvil", () => { const a = anvil(); return { root: a.group, undo: a.undo, redo: a.redo }; }],
	["Workbench", () => { const w = workbench(); return { root: w.icons, undo: w.undo, redo: w.redo }; }],
])("syncUndoControls on the %s controls", (_name, make) => {
	it("names the top step of each stack and enables the controls (U5)", () => {
		const { root, undo, redo } = make();
		syncUndoControls(root, peekOf("status in Mara Stoneway", "age in Mara Stoneway"));
		expect(undo.hasAttribute("aria-disabled")).toBe(false);
		expect(redo.hasAttribute("aria-disabled")).toBe(false);
		expect([undo.title, undo.getAttribute("aria-label")]).toEqual(["Undo: status in Mara Stoneway", "Undo: status in Mara Stoneway"]);
		expect([redo.title, redo.getAttribute("aria-label")]).toEqual(["Redo: age in Mara Stoneway", "Redo: age in Mara Stoneway"]);
	});

	it("disables only the empty side (U2a)", () => {
		const { root, undo, redo } = make();
		syncUndoControls(root, peekOf("status in Mara Stoneway", null));
		expect(undo.hasAttribute("aria-disabled")).toBe(false);
		expect(redo.getAttribute("aria-disabled")).toBe("true");
		expect([redo.title, redo.getAttribute("aria-label")]).toEqual(["Nothing to redo", "Nothing to redo"]);
	});

	it("goes back to disabled when the stacks empty again, never using the disabled attribute", () => {
		const { root, undo, redo } = make();
		syncUndoControls(root, peekOf("a", "b"));
		syncUndoControls(root, EMPTY);
		for (const el of [undo, redo]) {
			expect(el.getAttribute("aria-disabled")).toBe("true");
			expect(el.hasAttribute("disabled")).toBe(false);
		}
		expect([undo.title, redo.title]).toEqual(["Nothing to undo", "Nothing to redo"]);
	});

	it("keeps tabindex and role untouched, so a disabled control stays focusable", () => {
		const { root, undo } = make();
		const before = [undo.getAttribute("tabindex"), undo.getAttribute("role")];
		syncUndoControls(root, EMPTY);
		expect([undo.getAttribute("tabindex"), undo.getAttribute("role")]).toEqual(before);
	});
});

describe("controls follow peek() alone", () => {
	it("stay enabled while a probe reports the top step's note busy (AC-F6.4)", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		h.journal.registerProbe(() => "draft");
		const { group, undo } = anvil();
		syncUndoControls(group, h.journal.peek());
		expect(undo.hasAttribute("aria-disabled")).toBe(false);
		expect(undo.title).toBe("Undo: status in Mara Stoneway");
	});
});

describe("activateUndoControl", () => {
	it("calls journal.undo for the undo control and journal.redo for the redo control", async () => {
		const { group, undo, redo } = anvil();
		const journal = journalOf(peekOf("a", "b"));
		syncUndoControls(group, journal.peek());
		await activateUndoControl(undo, journal);
		expect([journal.undo.mock.calls.length, journal.redo.mock.calls.length]).toEqual([1, 0]);
		await activateUndoControl(redo, journal);
		expect([journal.undo.mock.calls.length, journal.redo.mock.calls.length]).toEqual([1, 1]);
	});

	it("calls nothing for a control with aria-disabled=true (U2)", async () => {
		const { group, undo, redo } = anvil();
		const journal = journalOf();
		syncUndoControls(group, journal.peek());
		expect(await activateUndoControl(undo, journal)).toBeNull();
		expect(await activateUndoControl(redo, journal)).toBeNull();
		expect(journal.undo).not.toHaveBeenCalled();
		expect(journal.redo).not.toHaveBeenCalled();
	});

	it("calls nothing for an element that is not an undo control", async () => {
		const journal = journalOf(peekOf("a", "b"));
		expect(await activateUndoControl(document.createElement("span"), journal)).toBeNull();
		expect(journal.undo).not.toHaveBeenCalled();
	});

	it("does not move focus", async () => {
		const { head, undo } = anvil();
		document.body.appendChild(head);
		const other = head.createEl("button");
		other.focus();
		const journal = journalOf(peekOf("a", null));
		await activateUndoControl(undo, journal);
		expect(document.activeElement).toBe(other);
		head.remove();
	});
});
