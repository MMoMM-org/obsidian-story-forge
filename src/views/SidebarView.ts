/**
 * SidebarView — the Story Forge sidebar panel.
 *
 * Extends Obsidian's ItemView to register as a persistent panel in the
 * right sidebar. Follows the active note via workspace.on('active-leaf-change')
 * and metadataCache.on('changed'), debounced to DEBOUNCE_MS.
 *
 * M1 implementation: panel shell + state rendering (S2–S9).
 * M2: query-engine integration.
 * M3: drill-in navigation (S10), backlinks seam.
 *
 * ADR-2: registerEvent/registerDomEvent for all listeners — no raw addEventListener.
 * ADR-5: guard own-leaf focus; first resolve deferred to onLayoutReady.
 */

import { ItemView, type WorkspaceLeaf, type App, debounce } from "obsidian";
import { SIDEBAR_VIEW_TYPE, ICON, DEBOUNCE_MS } from "constants";
import { ScopingService } from "scoping/ScopingService";
import type { NoteContext, EntityKind } from "scoping/NoteContext";
import type { TFile } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Whether the panel subject is tracking the active note or pinned to one. */
export type SubjectSource = "follow" | "pinned";

/** The note the panel is currently showing context for. */
export interface PanelSubject {
	file: TFile | null;
	source: SubjectSource;
}

// Internal render state discriminant
type RenderState =
	| { kind: "no-note" }
	| { kind: "non-md"; file: TFile }
	| { kind: "non-entity"; file: TFile; activeKind: EntityKind }
	| { kind: "resolving"; file: TFile; activeKind: EntityKind }
	| { kind: "resolved"; ctx: NoteContext }
	| { kind: "error"; file: TFile; retry: () => void };

// ---------------------------------------------------------------------------
// activateView — reveal-or-create helper
// ---------------------------------------------------------------------------

/**
 * Open the Story Forge sidebar panel, or reveal the existing leaf.
 *
 * Never creates a duplicate leaf — if one already exists, it is revealed.
 * Wire this to the ribbon button and the "Story Forge: open panel" command.
 */
export async function activateView(app: App): Promise<void> {
	const { workspace } = app;

	const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
	if (existing.length > 0 && existing[0]) {
		workspace.revealLeaf(existing[0]);
		return;
	}

	const leaf = workspace.getRightLeaf(false);
	if (!leaf) return;

	await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
	workspace.revealLeaf(leaf);
}

// ---------------------------------------------------------------------------
// StubContextTab
// ---------------------------------------------------------------------------

// Inline the stub here for M1 — will be extracted to StubContextTab.ts in T3.3

// ---------------------------------------------------------------------------
// SidebarView
// ---------------------------------------------------------------------------

export class SidebarView extends ItemView {
	private scoping: ScopingService;
	private subject: PanelSubject = { file: null, source: "follow" };
	private currentCtx: NoteContext | null = null;
	private lastError: Error | null = null;

	// Debounced follow function — coalesces rapid active-leaf-change events.
	private readonly _debouncedFollow: ((leaf: WorkspaceLeaf | null) => void) & {
		cancel: () => void;
		flush: () => void;
	};

	constructor(leaf: WorkspaceLeaf, app: App) {
		super(leaf, app);
		this.scoping = new ScopingService(app);
		this._debouncedFollow = debounce(
			(leaf: WorkspaceLeaf | null) => this._doFollow(leaf),
			DEBOUNCE_MS,
			true,
		);
	}

	// -------------------------------------------------------------------------
	// ItemView contract
	// -------------------------------------------------------------------------

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Story Forge";
	}

	getIcon(): string {
		return ICON;
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	async onOpen(): Promise<void> {
		// Set up the DOM structure
		this.contentEl.empty();
		this.contentEl.setAttribute("role", "region");
		this.contentEl.setAttribute("aria-label", "Story Forge panel");
		this.contentEl.setAttribute("aria-live", "polite");

		// Build the initial skeleton (before any note is resolved)
		this._buildShell();
		this._renderState({ kind: "no-note" });

		// Defer first resolve to layout-ready
		this.app.workspace.onLayoutReady(() => {
			// Wire up active-leaf-change (via registerEvent)
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
					this._debouncedFollow(leaf);
				}),
			);

			// Wire up metadataCache changed (re-resolve on metadata update for current file)
			this.registerEvent(
				this.app.metadataCache.on("changed", (file: TFile) => {
					if (
						this.subject.source === "pinned" ||
						!this.subject.file ||
						file.path !== this.subject.file.path
					) {
						return;
					}
					// Re-resolve current subject file
					this._resolveAndRender(this.subject.file);
				}),
			);

			// Trigger initial resolution based on the current active view
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownViewType);
			if (activeView) {
				const mdView = activeView as { file: TFile | null };
				if (mdView.file) {
					this._resolveAndRender(mdView.file);
					this.subject = { file: mdView.file, source: "follow" };
				}
			}
		});
	}

	async onClose(): Promise<void> {
		this._debouncedFollow.cancel();
		this.contentEl.empty();
	}

	// -------------------------------------------------------------------------
	// Subject management
	// -------------------------------------------------------------------------

	private setSubject(file: TFile | null, source: SubjectSource): void {
		this.subject = { file, source };
	}

	togglePin(): void {
		if (this.subject.source === "pinned") {
			// Unpin — resume following
			this.subject = { file: this.subject.file, source: "follow" };
			this._renderState(this._computeState());
		} else {
			// Pin — freeze subject
			this.subject = { file: this.subject.file, source: "pinned" };
			this._renderState(this._computeState());
		}
		this._updatePinButton();
	}

	// -------------------------------------------------------------------------
	// Follow pipeline
	// -------------------------------------------------------------------------

	private _doFollow(leaf: WorkspaceLeaf | null): void {
		// Guard: own leaf or non-MarkdownView → ignore
		if (!leaf) return;
		if (leaf === this.leaf) return;

		const viewType = leaf.view?.getViewType?.() ?? "";
		if (viewType !== "markdown") return;

		// Guard: pinned → ignore active-note changes
		if (this.subject.source === "pinned") return;

		const file = (leaf.view as { file?: TFile | null }).file ?? null;
		if (!file) {
			this.setSubject(null, "follow");
			this._renderState({ kind: "no-note" });
			return;
		}

		// Show resolving state immediately (before async resolve)
		const kind = this.scoping.classify(file);
		if (kind === "unknown") {
			this.setSubject(file, "follow");
			this._renderState({ kind: "non-entity", file, activeKind: kind });
			return;
		}

		this.setSubject(file, "follow");
		this._renderState({ kind: "resolving", file, activeKind: kind });
		this._resolveAndRender(file);
	}

	private _resolveAndRender(file: TFile): void {
		try {
			const ctx = this.scoping.resolve(file);
			this.currentCtx = ctx;
			this.lastError = null;
			this._renderState({ kind: "resolved", ctx });
		} catch (err) {
			this.lastError = err instanceof Error ? err : new Error(String(err));
			this.currentCtx = null;
			console.debug("[StoryForge] resolve error", err);
			this._renderState({
				kind: "error",
				file,
				retry: () => this._resolveAndRender(file),
			});
		}
	}

	private _computeState(): RenderState {
		const { file, source } = this.subject;
		if (!file) return { kind: "no-note" };
		if (file.extension !== "md") return { kind: "non-md", file };
		const kind = this.scoping.classify(file);
		if (kind === "unknown") return { kind: "non-entity", file, activeKind: kind };
		if (this.lastError) {
			const capturedFile = file;
			return { kind: "error", file, retry: () => this._resolveAndRender(capturedFile) };
		}
		if (this.currentCtx) return { kind: "resolved", ctx: this.currentCtx };
		return { kind: "resolving", file, activeKind: kind };
	}

	// -------------------------------------------------------------------------
	// DOM shell
	// -------------------------------------------------------------------------

	/** Header elements — stored as refs for pin button update. */
	private _pinBtn: HTMLButtonElement | null = null;
	private _titleEl: HTMLElement | null = null;
	private _badgeEl: HTMLElement | null = null;
	private _pinTagEl: HTMLElement | null = null;
	private _tabsEl: HTMLElement | null = null;
	private _bodyEl: HTMLElement | null = null;

	private _buildShell(): void {
		const ce = this.contentEl;
		(ce as unknown as { empty(): void }).empty();

		// Panel-level header (vhead: "Story Forge" + icons)
		const vhead = ce.createDiv({ cls: "sf-vhead" });
		vhead.createSpan({ cls: "sf-vhead-name", text: "Story Forge" });
		const icons = vhead.createDiv({ cls: "sf-icons" });

		// Pin button (aria-pressed)
		const pinBtn = document.createElement("button");
		pinBtn.className = "sf-pin-btn";
		pinBtn.setAttribute("aria-pressed", "false");
		pinBtn.setAttribute("aria-label", "Pin panel to current note");
		pinBtn.textContent = "📌";
		this._pinBtn = pinBtn;
		this.registerDomEvent(pinBtn, "click", () => this.togglePin());
		icons.appendChild(pinBtn);

		// Context header (chead: title + pin-tag + badge)
		const chead = ce.createDiv({ cls: "sf-chead" });
		this._titleEl = chead.createSpan({ cls: "sf-title" });
		this._pinTagEl = chead.createSpan({ cls: "sf-pin-tag" });
		this._pinTagEl.style.display = "none";
		this._badgeEl = chead.createSpan({ cls: "sf-badge" });

		// Tab strip (role=tablist; one tab "Context" in M1)
		const tabs = ce.createDiv({ cls: "sf-tabs" });
		tabs.setAttribute("role", "tablist");
		this._tabsEl = tabs;
		const tab = tabs.createDiv({ cls: "sf-tab sf-tab-sel" });
		tab.textContent = "Context";
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-selected", "true");
		tab.setAttribute("tabindex", "0");

		// Arrow key navigation for tabs (only one tab in M1, handler present)
		this.registerDomEvent(tabs, "keydown", (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				// M1: only one tab; focus stays on current tab
				(e.target as HTMLElement).focus();
				e.preventDefault();
			}
		});

		// Body / tabpanel
		const body = ce.createDiv({ cls: "sf-body" });
		body.setAttribute("role", "tabpanel");
		body.setAttribute("aria-live", "polite");
		this._bodyEl = body;
	}

	// -------------------------------------------------------------------------
	// State rendering
	// -------------------------------------------------------------------------

	private _renderState(state: RenderState): void {
		this._updateHeader(state);
		this._updateBody(state);
	}

	private _updateHeader(state: RenderState): void {
		if (!this._titleEl || !this._badgeEl || !this._pinTagEl) return;

		const titleEl = this._titleEl;
		const badgeEl = this._badgeEl;
		const pinTagEl = this._pinTagEl;

		// Title
		if (state.kind === "no-note") {
			titleEl.textContent = "—";
			titleEl.className = "sf-title sf-title-none";
		} else if (state.kind === "non-md") {
			titleEl.textContent = state.file.name;
			titleEl.className = "sf-title";
		} else if (state.kind === "non-entity") {
			titleEl.textContent = state.file.basename;
			titleEl.className = "sf-title";
		} else if (state.kind === "resolving") {
			titleEl.textContent = state.file.basename;
			titleEl.className = "sf-title";
		} else if (state.kind === "resolved") {
			titleEl.textContent = state.ctx.activeFile.basename;
			titleEl.className = "sf-title";
		} else if (state.kind === "error") {
			titleEl.textContent = state.file.basename;
			titleEl.className = "sf-title";
		}

		// Badge
		if (state.kind === "no-note") {
			badgeEl.textContent = "—";
			badgeEl.className = "sf-badge sf-badge-none";
		} else if (state.kind === "non-md") {
			badgeEl.textContent = "—";
			badgeEl.className = "sf-badge sf-badge-none";
		} else if (state.kind === "non-entity") {
			badgeEl.textContent = "not an entity";
			badgeEl.className = "sf-badge sf-badge-none";
		} else if (state.kind === "resolving") {
			badgeEl.textContent = state.activeKind;
			badgeEl.className = `sf-badge sf-badge-${state.activeKind}`;
		} else if (state.kind === "resolved") {
			badgeEl.textContent = state.ctx.activeKind;
			badgeEl.className = `sf-badge sf-badge-${state.ctx.activeKind}`;
		} else if (state.kind === "error") {
			badgeEl.textContent = "—";
			badgeEl.className = "sf-badge sf-badge-none";
		}

		// Pin tag
		if (this.subject.source === "pinned" && state.kind !== "no-note") {
			pinTagEl.textContent = "pinned";
			pinTagEl.style.display = "";
		} else {
			pinTagEl.textContent = "";
			pinTagEl.style.display = "none";
		}
	}

	private _updateBody(state: RenderState): void {
		if (!this._bodyEl) return;
		const body = this._bodyEl;
		(body as unknown as { empty(): void }).empty();

		if (state.kind === "no-note") {
			// S2: no note open
			const empty = body.createDiv({ cls: "sf-empty" });
			empty.createDiv({ cls: "sf-empty-ic", text: "🗎" });
			empty.createDiv({ cls: "sf-empty-lead", text: "No note open" });
			empty.createDiv({ text: "Open a note to see its story context." });
		} else if (state.kind === "non-md") {
			// S3: non-markdown file
			const empty = body.createDiv({ cls: "sf-empty" });
			empty.createDiv({ cls: "sf-empty-ic", text: "🖼" });
			empty.createDiv({ text: "Story Forge follows markdown notes." });
		} else if (state.kind === "non-entity") {
			// S4: not a story entity
			const empty = body.createDiv({ cls: "sf-empty" });
			empty.createDiv({ cls: "sf-empty-ic", text: "◌" });
			empty.createDiv({
				text: "This note isn't a tracked character, location, scene, object, lore, or plotline.",
			});
		} else if (state.kind === "resolving") {
			// S5: resolving (skeleton)
			body.createDiv({ cls: "sf-resolving", text: "resolving…" });
			body.createDiv({ cls: "sf-skel" });
			body.createDiv({ cls: "sf-skel" });
			body.createDiv({ cls: "sf-skel" });
		} else if (state.kind === "resolved") {
			// S6/S7: resolved context (stub)
			this._renderResolved(body, state.ctx);
		} else if (state.kind === "error") {
			// S9: error with Retry button
			this._renderError(body, state.retry);
		}
	}

	private _renderResolved(body: HTMLElement, ctx: NoteContext): void {
		body.createDiv({ cls: "sf-stublabel", text: "resolved context (stub)" });
		const rows = body.createDiv({ cls: "sf-rows" });
		for (const entity of ctx.entities) {
			const row = rows.createDiv({ cls: "sf-row" });
			row.createSpan({ cls: "sf-f", text: entity.field ?? "" });
			row.createSpan({ cls: "sf-lnk", text: entity.file.basename });
			row.createSpan({ cls: "sf-k", text: entity.kind });
		}
		// Appears footer (backlink seam — M3)
		body.createDiv({
			cls: "sf-appears",
			text: "appears in: — (M3)",
		});
	}

	private _renderError(body: HTMLElement, retry: () => void): void {
		const errbox = body.createDiv({ cls: "sf-errbox" });
		errbox.createDiv({ text: "⚠ Couldn't read this note's properties." });
		const btn = document.createElement("button");
		btn.className = "sf-btn";
		btn.textContent = "Retry";
		this.registerDomEvent(btn, "click", () => retry());
		errbox.appendChild(btn);
	}

	private _updatePinButton(): void {
		if (!this._pinBtn) return;
		const isPinned = this.subject.source === "pinned";
		this._pinBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");
		this._pinBtn.classList.toggle("sf-pin-active", isPinned);
	}
}

// Helper: MarkdownView type token for getActiveViewOfType (avoid circular import)
// We use a local sentinel object that matches Obsidian's MarkdownView type check.
class MarkdownViewType {}
