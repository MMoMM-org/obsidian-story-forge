/**
 * undoControls — the ↶ ↷ controls of the Anvil and the Workbench (spec 009 T5.1, ADR-50).
 *
 * Builds the markup of mockups U1/U4, keeps it in step with `journal.peek()`, and activates it.
 * Disabled means `aria-disabled="true"` plus the muted look, never the `disabled` attribute, so
 * the "Nothing to undo" tooltip stays reachable and the control stays focusable. The controls
 * follow the stacks only: pending work (a draft, a write in flight) leaves them enabled so the
 * click can explain itself with the "Save your edit first" notice (shown by the journal, not
 * here). Nothing here shows a notice or moves focus.
 */
import type { UndoDirection, UndoOutcome } from "undo/journalTypes";
import type { StackPeek } from "undo/undoJournal";
import { controlTitle } from "undo/stepLabel";

/** What the controls need of the journal. */
export interface UndoControlsJournal {
	peek(): StackPeek;
	undo(): Promise<UndoOutcome>;
	redo(): Promise<UndoOutcome>;
}

const GLYPH: Record<UndoDirection, string> = { undo: "↶", redo: "↷" };
const CONTROL = "[data-sf-undo]";

/** The direction a control stands for, or null for an element that is no control. */
export function undoDirectionOf(el: Element): UndoDirection | null {
	const value = el.getAttribute("data-sf-undo");
	return value === "undo" || value === "redo" ? value : null;
}

/** Tooltip, accessible name and disabled state of one control. */
function describeControl(el: HTMLElement, direction: UndoDirection, label: string | null): void {
	const text = controlTitle(direction, label);
	el.title = text;
	el.setAttribute("aria-label", text);
	if (label === null) el.setAttribute("aria-disabled", "true");
	else el.removeAttribute("aria-disabled");
}

/** The Anvil pair: `div.sf-undo-group` appended to `head`, after the tab strip and zoom slot. */
export function buildAnvilUndoControls(head: HTMLElement): HTMLElement {
	const group = head.createDiv({ cls: "sf-undo-group" });
	for (const direction of ["undo", "redo"] as const) {
		const tool = group.createEl("span", {
			cls: "sf-undo-tool",
			text: GLYPH[direction],
			attr: { role: "button", tabindex: "0", "data-sf-undo": direction },
		});
		describeControl(tool, direction, null);
	}
	return group;
}

/** The Workbench pair: two native `button.sf-undo-btn` placed first in `icons`, undo then redo. */
export function buildWorkbenchUndoControls(icons: HTMLElement): HTMLElement[] {
	const buttons = (["undo", "redo"] as const).map((direction) => {
		const button = icons.createEl("button", {
			cls: "sf-undo-btn",
			text: GLYPH[direction],
			attr: { type: "button", "data-sf-undo": direction },
		});
		describeControl(button, direction, null);
		return button;
	});
	icons.prepend(...buttons);
	return buttons;
}

/** Set `aria-disabled`, `title` and `aria-label` of every control under `root` from `peek`. */
export function syncUndoControls(root: ParentNode, peek: StackPeek): void {
	for (const el of Array.from(root.querySelectorAll<HTMLElement>(CONTROL))) {
		const direction = undoDirectionOf(el);
		if (direction !== null) describeControl(el, direction, peek[direction]?.label ?? null);
	}
}

/**
 * Run the control's action. A disabled control, or an element that is no control, does nothing
 * and shows no notice. @returns the outcome, or null when nothing was called.
 */
export async function activateUndoControl(el: Element, journal: UndoControlsJournal): Promise<UndoOutcome | null> {
	const direction = undoDirectionOf(el);
	if (direction === null || el.getAttribute("aria-disabled") === "true") return null;
	return direction === "undo" ? journal.undo() : journal.redo();
}
