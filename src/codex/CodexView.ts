/**
 * CodexView — thin main-area ItemView host (T3.3, ADR-2 Option A).
 *
 * CON-3: This file has ZERO Bases typings. It is purely an "Open Codex"
 * entry point. When Bases is available, the open-codex command (wired in
 * main.ts) opens the seed Codex.base directly via the vault. CodexView's
 * own render job is ONLY the S46 degrade (Bases off).
 *
 * Obsidian requires a registered view type for every leaf opened in the
 * main area via setViewState; CODEX_VIEW_TYPE is the identity registered
 * by main.ts. This view is only ever set as the leaf's view type for the
 * S46 degrade path (Bases off, main.ts "open-codex" command falls back here).
 *
 * @ref SDD/ADR-2 addendum — Option A: Bases-native tab bar; CodexView is thin
 * @ref SDD/CON-3 — ZERO Bases typings outside src/bases/
 * @ref PRD/AC-F2.5 — Bases-off degrade (S46); panel + Dataview unaffected
 */

import { ItemView, Platform } from "obsidian";
import type { WorkspaceLeaf, IconName } from "obsidian";
import { CODEX_VIEW_TYPE } from "pluginConstants";

// ---------------------------------------------------------------------------
// Augmented element type (mirrors SidebarView pattern)
// ---------------------------------------------------------------------------

type AugEl = HTMLElement & {
	createDiv(opts?: { cls?: string; text?: string }): AugEl;
	createSpan(opts?: { cls?: string; text?: string }): AugEl;
	createEl<K extends keyof HTMLElementTagNameMap>(
		tag: K,
		opts?: { cls?: string; text?: string },
	): HTMLElementTagNameMap[K];
	empty(): void;
};

function aug(el: HTMLElement): AugEl {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	return el as unknown as AugEl;
}

// ---------------------------------------------------------------------------
// CodexView
// ---------------------------------------------------------------------------

/**
 * Thin main-area ItemView — renders ONLY the S46 degrade (Bases off).
 *
 * When Bases is available, the "open-codex" command in main.ts opens the
 * seed Codex.base file directly instead of activating this view.
 *
 * Component discipline: uses registerDomEvent / register for all cleanup
 * so Obsidian's Component base auto-releases on unload (CON-4).
 */
export class CodexView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	// -------------------------------------------------------------------------
	// ItemView contract
	// -------------------------------------------------------------------------

	getViewType(): string {
		return CODEX_VIEW_TYPE;
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		return "Story Forge Codex";
	}

	getIcon(): IconName {
		return "library";
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	async onOpen(): Promise<void> {
		const body = aug(this.contentEl);
		body.empty();
		this._renderBasesDegrade(body);
	}

	async onClose(): Promise<void> {
		aug(this.contentEl).empty();
	}

	// -------------------------------------------------------------------------
	// S46 degrade render
	// -------------------------------------------------------------------------

	/**
	 * Render the S46 "Bases is off" degrade state.
	 *
	 * Mirrors the existing `_renderEngineMissing(body, "bases")` copy in
	 * SidebarView (`:1228`) — same text, same structure.
	 *
	 * CON-3: no Bases typings imported; the text references "Bases" as a
	 * user-facing noun, not as a type.
	 */
	private _renderBasesDegrade(body: AugEl): void {
		const empty = body.createDiv({ cls: "sf-engine-missing sf-empty" });
		empty.createDiv({ cls: "sf-empty-ic", text: "⚙" });

		if (Platform.isMobile) {
			empty.createDiv({
				cls: "sf-empty-lead",
				text: "⚙ Bases isn't available on this device",
			});
			empty.createDiv({
				text: "The full grid needs the core Bases plugin, which is not available on mobile. Falling back to a read-only list from metadata.",
			});
		} else {
			empty.createDiv({
				cls: "sf-empty-lead",
				text: "⚙ Bases is off — showing a simple list",
			});
			empty.createDiv({
				text: "The full grid needs the core Bases plugin (Obsidian 1.12.7+). Sorting, filtering, and columns are unavailable. Falling back to a read-only list from metadata.",
			});
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Enable Bases" is an action label for a proper noun
			const btn = empty.createEl("button", { cls: "sf-btn", text: "Enable Bases" });
			// Plain addEventListener: this element is GC'd on body.empty() (same
			// pattern as SidebarView._renderEngineMissing — ADR-2 exception).
			btn.addEventListener("click", () => {
				(this.app as unknown as { setting?: { open?: () => void } }).setting?.open?.();
			});
		}
	}
}
