/**
 * BindModal — sidebar tab + command registration step (S22).
 *
 * A PURE UI step: it collects the tab label, whether to register a command, and
 * the command name — then RESOLVES that result to the caller. It performs NO
 * side-effects (no store write, no command registration); the caller owns the
 * commit. This makes it reusable by both the import flow (ImportPickerModal) and
 * Settings "Edit".
 *
 * Every imported view IS a sidebar tab (SidebarView renders one tab per store
 * record), so there is no "show as tab" choice: the tab label is always set.
 * Only the command binding is optional.
 *
 * Use present() — NOT open() — to get the Promise<BindResult | null>. The
 * promise resolves with the result object on "Done", or null on "Back" /
 * dismiss / close without Done. This mirrors DisclosureModal.present().
 *
 * @ref SDD/Runtime View — Flow C (bind step)
 * @ref SDD/Cross-Cutting Concepts — User Interface S22
 * @ref SDD/ADR-6 (sf-name as default tab label)
 * @ref SDD/ADR-9 (store-generated id; no vault write)
 * @ref PRD/AC-F3.6, AC-F3.7
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";

/** Values used to pre-fill the BindModal inputs. */
export interface BindSeed {
	/** Default tab-label value (sf-name, ADR-6). */
	name: string;
	/** "Register as command" checkbox default (defaults to false). */
	registerCommand?: boolean;
	/** Command-name input default (defaults to "Story Forge: " + name). */
	commandName?: string;
}

/** The result the user confirmed via "Done". */
export interface BindResult {
	/** The (possibly-edited) tab-label input value. */
	label: string;
	/** Whether the "Register as command" checkbox is checked. */
	registerCommand: boolean;
	/** The command-name input value. */
	commandName: string;
}

/**
 * BindModal — Modal subclass.
 *
 * Constructor: new BindModal(app, seed).
 * On "Done": resolves the BindResult and closes.
 * On "Back"/dismiss: resolves null.
 */
export class BindModal extends Modal {
	private commandCheckboxEl: HTMLInputElement | null = null;
	private cmdInputEl: HTMLInputElement | null = null;
	private tabInputEl: HTMLInputElement | null = null;

	/** Resolve handle for the present() promise; nulled after first resolve. */
	private _resolve: ((result: BindResult | null) => void) | null = null;

	constructor(
		app: App,
		private readonly seed: BindSeed,
	) {
		super(app);
	}

	/** Open the modal and return a promise that resolves with the user's result (or null). */
	present(): Promise<BindResult | null> {
		const promise = new Promise<BindResult | null>((resolve) => {
			this._resolve = resolve;
		});
		this.open();
		return promise;
	}

	onOpen(): void {
		this._render();
	}

	onClose(): void {
		// Dismiss without Done resolves null (resolve-once guards double-resolve).
		this._resolveOnce(null);
		this.contentEl.empty();
	}

	// ---------------------------------------------------------------------------
	// Private rendering
	// ---------------------------------------------------------------------------

	private _render(): void {
		const el = this.contentEl;
		el.empty();

		const registerCommand = this.seed.registerCommand ?? false;
		const commandName = this.seed.commandName ?? `Story Forge: ${this.seed.name}`;

		el.createEl("h2", { text: "Bind view" });
		el.createEl("p", { text: this.seed.name, cls: "sf-bind-name" });

		const bodyEl = el.createEl("div", { cls: "sf-bind-body" });

		// Tab label row — every imported view is a sidebar tab, so the label is
		// always present and enabled (no checkbox gates it).
		const tabRow = bodyEl.createEl("div", { cls: "sf-bind-row" });

		tabRow.createEl("span", { text: "Sidebar tab label", cls: "sf-bind-label" });

		const tabInputEl = activeDocument.createElement("input");
		tabInputEl.type = "text";
		tabInputEl.value = this.seed.name;
		tabInputEl.placeholder = "Tab label";
		tabInputEl.className = "sf-bind-input";
		tabRow.appendChild(tabInputEl);

		this.tabInputEl = tabInputEl;

		// Command registration row
		const cmdRow = bodyEl.createEl("div", { cls: "sf-bind-row" });

		const cmdCheckbox = activeDocument.createElement("input");
		cmdCheckbox.type = "checkbox";
		cmdCheckbox.checked = registerCommand;
		cmdCheckbox.className = "sf-bind-checkbox";
		cmdCheckbox.dataset["role"] = "command";
		cmdRow.appendChild(cmdCheckbox);
		cmdRow.createEl("span", { text: "Register as command", cls: "sf-bind-label" });

		const cmdInputEl = activeDocument.createElement("input");
		cmdInputEl.type = "text";
		cmdInputEl.value = commandName;
		cmdInputEl.placeholder = "Command name";
		cmdInputEl.className = "sf-bind-input";
		cmdInputEl.disabled = !registerCommand;
		cmdRow.appendChild(cmdInputEl);

		this.commandCheckboxEl = cmdCheckbox;
		this.cmdInputEl = cmdInputEl;

		cmdCheckbox.addEventListener("change", () => {
			cmdInputEl.disabled = !cmdCheckbox.checked;
		});

		// Footer buttons
		const footEl = el.createEl("div", { cls: "sf-bind-foot" });
		const backBtn = footEl.createEl("button", { text: "Back" });
		const doneBtn = footEl.createEl("button", { text: "Done" });

		backBtn.addEventListener("click", () => {
			this._resolveOnce(null);
			this.close();
		});
		doneBtn.addEventListener("click", () => this._onConfirm());
	}

	private _onConfirm(): void {
		const result: BindResult = {
			label: this.tabInputEl?.value ?? this.seed.name,
			registerCommand: this.commandCheckboxEl?.checked ?? false,
			commandName: this.cmdInputEl?.value ?? `Story Forge: ${this.seed.name}`,
		};
		this._resolveOnce(result);
		this.close();
	}

	// ---------------------------------------------------------------------------
	// Promise helpers
	// ---------------------------------------------------------------------------

	/** Resolve the promise exactly once; subsequent calls are no-ops. */
	private _resolveOnce(result: BindResult | null): void {
		if (this._resolve === null) return;
		const r = this._resolve;
		this._resolve = null;
		r(result);
	}
}
