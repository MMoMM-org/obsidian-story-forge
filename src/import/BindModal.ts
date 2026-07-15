/**
 * BindModal — sidebar tab + command registration step (S22).
 *
 * Opened by ImportPickerModal after a successful importToStore.
 * Pre-fills the tab label from def.name (sf-name ADR-6).
 * Offers a checkbox to register a command palette entry.
 * On confirm: persists the (possibly-edited) tab label to ViewRecord.commandName
 * via store.setRecord; invokes the injected registerCommand callback only if
 * the command checkbox is checked.
 * On cancel (Back): closes without rollback — the view is already in the store
 * (disabled by default, ADR-5 safe default); no store write happens on cancel.
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
import type { RegisterCommandCallback } from "import/types";
import type { ViewStore } from "store/ViewStore";

/**
 * BindModal — Modal subclass.
 *
 * Constructor signature for T4.2/T4.4 callers:
 *   new BindModal(app, viewId, def, store, (id, name) => plugin.addCommand({...}))
 *
 * On confirm: calls store.setRecord to persist the commandName (editable tab
 * label), then calls registerCommand if the checkbox is checked.
 * On cancel (Back): closes with no store writes and no registerCommand call.
 */
export class BindModal extends Modal {
	private commandCheckboxEl: HTMLInputElement | null = null;
	private cmdInputEl: HTMLInputElement | null = null;
	private tabInputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly viewId: string,
		private readonly def: ViewDefinition,
		private readonly store: ViewStore,
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

		this.tabInputEl = tabInputEl;

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
		doneBtn.addEventListener("click", () => void this._onConfirm());
	}

	private async _onConfirm(): Promise<void> {
		// S5: persist the (possibly-edited) tab label to ViewRecord.commandName
		const commandName = this.tabInputEl?.value ?? this.def.name;
		const views = await this.store.getViews();
		const existing = views[this.viewId];
		if (existing) {
			await this.store.setRecord(this.viewId, { ...existing, commandName });
		}

		// Register command if checkbox is checked
		if (this.commandCheckboxEl?.checked && this.cmdInputEl) {
			this.registerCommand(this.viewId, this.cmdInputEl.value);
		}

		this.close();
	}
}
