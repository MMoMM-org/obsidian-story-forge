/**
 * suggesters — the popovers on the settings fields that name a vault tag or folder
 * (spec 008 T7.1 live-test fixes, mockups-library.html L1 and L3a).
 *
 * They only add a popover: the drawn text field stays, free text stays allowed, and choosing a
 * suggestion hands the field its value and fires the field's own events, so the existing save or
 * commit path runs unchanged.
 */

import { AbstractInputSuggest, type App } from "obsidian";

/** Choosing a suggestion is typing it: the field's own listeners (`input`, `change`) take over. */
abstract class FieldSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, protected readonly field: HTMLInputElement) {
		super(app, field);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.textContent = value;
	}

	selectSuggestion(value: string): void {
		this.setValue(this.complete(value));
		this.field.dispatchEvent(new Event("input", { bubbles: true }));
		this.field.dispatchEvent(new Event("change", { bubbles: true }));
		this.close();
	}

	/** The field's new text once `value` is chosen; by default the value as is. */
	protected complete(value: string): string {
		return value;
	}
}

const matches = (candidate: string, typed: string): boolean => candidate.toLowerCase().includes(typed.toLowerCase());

/** Vault tags, shown without a leading `#`, filtered by the typed text. */
class TagSuggest extends FieldSuggest {
	constructor(app: App, field: HTMLInputElement, private readonly tags: () => readonly string[]) {
		super(app, field);
	}

	protected getSuggestions(query: string): string[] {
		const typed = query.trim().replace(/^#/, "");
		return [...new Set(this.tags())].filter((t) => matches(t, typed)).sort();
	}
}

/**
 * Vault folders filtered by the typed text. In list mode (a comma-separated field) only the last
 * segment is matched and completed: the segments before it are kept, joined with ", ".
 */
class FolderSuggest extends FieldSuggest {
	constructor(app: App, field: HTMLInputElement, private readonly list: boolean) {
		super(app, field);
	}

	protected getSuggestions(query: string): string[] {
		const typed = this.list ? (query.split(",").pop() ?? "") : query;
		return this.app.vault.getAllFolders().map((f) => f.path).filter((p) => matches(p, typed.trim()));
	}

	protected complete(value: string): string {
		if (!this.list) return value;
		const kept = this.getValue().split(",").slice(0, -1).map((s) => s.trim()).filter((s) => s.length > 0);
		return [...kept, value].join(", ");
	}
}

/** Attach a tag popover to `field`; `tags` is read each time the popover opens. */
export function attachTagSuggest(app: App, field: HTMLInputElement, tags: () => readonly string[]): void {
	new TagSuggest(app, field, tags);
}

/** Attach a folder popover to `field`; `list` marks a comma-separated field. */
export function attachFolderSuggest(app: App, field: HTMLInputElement, opts: { list: boolean }): void {
	new FolderSuggest(app, field, opts.list);
}
