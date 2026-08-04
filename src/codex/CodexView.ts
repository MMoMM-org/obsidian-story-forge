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
	 * Same structure as `_renderEngineMissing(body, "bases")` in SidebarView
	 * (`:1519`), but NOT the same copy: SidebarView's degrade hint is followed
	 * by `nativeEngine.render(...)`, which actually draws a metadata list below
	 * it — so "falling back to a read-only list" is true there. This view has
	 * no such follow-up render (CON-3's whole point is that this file stays
	 * Bases-typing-free and thin), so the copy instead points at the Anvil's
	 * Codex tab (Phase 4, `codexTab.ts`), which renders the real grid without
	 * needing Bases at all — the honest alternative, not a promise this view
	 * cannot keep.
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
				text: "This view opens the Bases-native grid, which needs the core Bases plugin — not available on mobile. Open Anvil (the main workspace view) and switch to its Codex tab instead; it shows the same collections without Bases.",
			});
		} else {
			empty.createDiv({
				cls: "sf-empty-lead",
				text: "⚙ Bases is off",
			});
			empty.createDiv({
				text: "This view opens the Bases-native grid, which needs the core Bases plugin (Obsidian 1.12.7+). Open Anvil (the main workspace view) and switch to its Codex tab instead; it shows the same collections without Bases.",
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
