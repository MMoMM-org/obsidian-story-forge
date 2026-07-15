/**
 * BindModal — sidebar tab + command registration step (S22).
 *
 * Opened by ImportPickerModal after a successful importToStore.
 * Pre-fills the tab label from def.name (sf-name ADR-6).
 * Offers a checkbox to register a command palette entry.
 * On confirm: invokes the injected registerCommand callback only if checked.
 * On cancel (Back): closes without rollback — the view is already in the store
 * (disabled by default, ADR-5 safe default); no store write happens here.
 *
 * @ref SDD/Runtime View — Flow C (bind step)
 * @ref SDD/Cross-Cutting Concepts — User Interface S22
 * @ref SDD/ADR-6 (sf-name as default tab label)
 * @ref SDD/ADR-9 (store-generated id; no vault write)
 * @ref PRD/AC-F3.6, AC-F3.7
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { ViewDefinition } from "import/ViewDefinition";
import type { RegisterCommandCallback } from "import/ImportPickerModal";

/**
 * BindModal — Modal subclass.
 *
 * Constructor signature for T4.2/T4.4 callers:
 *   new BindModal(app, viewId, def, (id, name) => plugin.addCommand({...}))
 *
 * The `registerCommand` callback is called only when the user checks "Register
 * as command" and confirms. It is NOT called on cancel (no rollback, no side-
 * effects from the bind step).
 */
export class BindModal extends Modal {
	private commandCheckboxEl: HTMLInputElement | null = null;
	private cmdInputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly viewId: string,
		private readonly def: ViewDefinition,
		private readonly registerCommand: RegisterCommandCallback,
	) {
		super(app);
	}

	onOpen(): void {
		this._render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ---------------------------------------------------------------------------
	// Private rendering
	// ---------------------------------------------------------------------------

	private _render(): void {
		const el = this.contentEl;
		el.empty();

		el.createEl("h2", { text: "Bind view" });
		el.createEl("p", { text: this.def.name, cls: "sf-bind-name" });

		const bodyEl = el.createEl("div", { cls: "sf-bind-body" });

		// Tab label row — uses HTMLInputElement via activeDocument.createElement
		const tabRow = bodyEl.createEl("div", { cls: "sf-bind-row" });

		const tabCheckbox = activeDocument.createElement("input");
		tabCheckbox.type = "checkbox";
		tabCheckbox.checked = true;
		tabCheckbox.className = "sf-bind-checkbox";
		tabRow.appendChild(tabCheckbox);
		tabRow.createEl("span", { text: "Show as tab in sidebar", cls: "sf-bind-label" });

		const tabInputEl = activeDocument.createElement("input");
		tabInputEl.type = "text";
		tabInputEl.value = this.def.name;
		tabInputEl.placeholder = "Tab label";
		tabInputEl.className = "sf-bind-input";
		tabRow.appendChild(tabInputEl);

		tabCheckbox.addEventListener("change", () => {
			tabInputEl.disabled = !tabCheckbox.checked;
		});

		// Command registration row
		const cmdRow = bodyEl.createEl("div", { cls: "sf-bind-row" });

		const cmdCheckbox = activeDocument.createElement("input");
		cmdCheckbox.type = "checkbox";
		cmdCheckbox.checked = false;
		cmdCheckbox.className = "sf-bind-checkbox";
		cmdCheckbox.dataset["role"] = "command";
		cmdRow.appendChild(cmdCheckbox);
		cmdRow.createEl("span", { text: "Register as command", cls: "sf-bind-label" });

		const cmdInputEl = activeDocument.createElement("input");
		cmdInputEl.type = "text";
		cmdInputEl.value = `Story Forge: ${this.def.name}`;
		cmdInputEl.placeholder = "Command name";
		cmdInputEl.className = "sf-bind-input";
		cmdInputEl.disabled = true;
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

		backBtn.addEventListener("click", () => this.close());
		doneBtn.addEventListener("click", () => this._onConfirm());
	}

	private _onConfirm(): void {
		if (this.commandCheckboxEl?.checked && this.cmdInputEl) {
			this.registerCommand(this.viewId, this.cmdInputEl.value);
		}
		this.close();
	}
}
