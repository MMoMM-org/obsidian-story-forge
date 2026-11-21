/**
 * Global type augmentations that mirror the real obsidian @types/obsidian globals.
 *
 * Split out from obsidian.ts so the main test compile (tsconfig.test.json, which
 * aliases "obsidian" → the mock) still sees these augmentations (needed for
 * SidebarView.createEl etc.) while the isolated mock-guard compile
 * (tsconfig.mock.json) can exclude this file to avoid the activeDocument /
 * HTMLElement redeclare conflicts with the real obsidian.d.ts.
 *
 * tsconfig.test.json includes test/**\/*.ts which matches .d.ts, so this file is
 * automatically picked up by the main test compile.
 */

declare global {
	/** Obsidian's popout-window-aware document reference. */
	const activeDocument: Document;
	/** Obsidian's popout-window-aware window reference. */
	const activeWindow: Window;

	interface Node {
		/** Cross-window instanceof, as in obsidian.d.ts (installed by installInstanceOf). */
		instanceOf<T>(type: { new (): T }): this is T;
	}

	interface HTMLElement {
		// Generic over the tag name, mirroring real obsidian.d.ts so createEl("input")
		// resolves to HTMLInputElement (not a bare HTMLElement) under the test compile.
		createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			opts?: {
				text?: string;
				cls?: string | string[];
				type?: string;
				placeholder?: string;
				value?: string;
				href?: string;
				attr?: Record<string, string>;
				title?: string;
			},
		): HTMLElementTagNameMap[K];
		// Same option bag as createEl: the real createDiv/createSpan take Obsidian's DomElementInfo
		// (obsidian.d.ts), so `attr` and `title` are valid on them too.
		createDiv(opts?: { cls?: string | string[]; text?: string; attr?: Record<string, string>; title?: string }): HTMLDivElement;
		createSpan(opts?: { cls?: string | string[]; text?: string; attr?: Record<string, string>; title?: string }): HTMLSpanElement;
		appendText(text: string): void;
		empty(): void;
		setCssProps(props: Record<string, string>): void;
		addClass(...classes: string[]): void;
		removeClass(...classes: string[]): void;
		toggleClass(cls: string, force?: boolean): void;
		setText(text: string): void;
		// Visibility, as in obsidian.d.ts. isShown() is deliberately absent: the
		// real one reads layout, which jsdom has none of (see obsidian.ts).
		show(): void;
		hide(): void;
		toggle(show: boolean): void;
	}
}

export {};
