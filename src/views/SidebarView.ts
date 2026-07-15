/**
 * SidebarView — the Story Forge sidebar panel.
 *
 * Extends Obsidian's ItemView to register as a persistent panel in the
 * right sidebar. Follows the active note via workspace.on('active-leaf-change')
 * and metadataCache.on('changed'), debounced to DEBOUNCE_MS.
 *
 * M1 implementation: panel shell + state rendering (S2–S9).
 * M2: query-engine integration (engine dispatch in _renderResolved; ADR-7).
 * M3: drill-in navigation (S10), backlinks seam.
 *
 * ADR-2: registerEvent/registerDomEvent for all listeners — no raw addEventListener.
 * ADR-5: guard own-leaf focus; first resolve deferred to onLayoutReady.
 * ADR-7: teardown → body.empty() → engine.render order on every dispatch branch.
 */

import {
	ItemView,
	MarkdownView,
	type WorkspaceLeaf,
	type App,
	type IconName,
	debounce,
} from "obsidian";
import { SIDEBAR_VIEW_TYPE, ICON, DEBOUNCE_MS } from "pluginConstants";
import { ScopingService } from "scoping/ScopingService";
import type { NoteContext, EntityKind } from "scoping/NoteContext";
import type { TFile } from "obsidian";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";

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

// Augmented element type (Obsidian DOM helpers — added at runtime by Obsidian)
type AugEl = HTMLElement & {
	createDiv(opts?: { cls?: string; text?: string }): AugEl;
	createSpan(opts?: { cls?: string; text?: string }): AugEl;
	empty(): void;
};

function aug(el: HTMLElement): AugEl {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	return el as unknown as AugEl;
}

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

	// revealLeaf exists well before its @since 1.7.2 (awaitable) form; we don't
	// depend on the returned promise (reveal is fire-and-forget here), so we call
	// the version-agnostic synchronous form via `void` and keep minAppVersion at
	// 1.5.7 (CON-1) rather than bumping the manifest for an unused await.
	const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
	const existingLeaf = existing[0];
	if (existingLeaf) {
		// eslint-disable-next-line obsidianmd/no-unsupported-api -- see note above; reveal is fire-and-forget, minAppVersion stays 1.5.7 (CON-1)
		void workspace.revealLeaf(existingLeaf);
		return;
	}

	const leaf = workspace.getRightLeaf(false);
	if (!leaf) return;

	await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
	// eslint-disable-next-line obsidianmd/no-unsupported-api -- see note above; reveal is fire-and-forget, minAppVersion stays 1.5.7 (CON-1)
	void workspace.revealLeaf(leaf);
}

// ---------------------------------------------------------------------------
// SidebarView
// ---------------------------------------------------------------------------

export class SidebarView extends ItemView {
	private scoping: ScopingService;
	private subject: PanelSubject = { file: null, source: "follow" };
	private currentCtx: NoteContext | null = null;
	private lastError: Error | null = null;

	// M2: injected engine dependencies (optional — absent when constructed from main.ts pre-T4.4)
	private registry: EngineRegistry | null;
	private consentGate: ConsentGate | null;
	private nativeEngine: NativeScopingEngine | null;

	// M2: tracks the engine currently rendered into the panel body (ADR-7 teardown)
	private currentEngine: QueryEngine | null = null;
	// M2: the ViewRecord currently rendered (selected view tab)
	private currentRecord: ViewRecord | null = null;

	// Debounced follow function — coalesces rapid active-leaf-change events.
	private readonly _debouncedFollow: ReturnType<
		typeof debounce<[WorkspaceLeaf | null], void>
	>;

	/**
	 * @param leaf        - Obsidian workspace leaf
	 * @param registry    - M2: injected EngineRegistry (optional until T4.4 main.ts rewire)
	 * @param consentGate - M2: injected ConsentGate (optional until T4.4 main.ts rewire)
	 * @param nativeEngine - M2: injected NativeScopingEngine fallback (optional until T4.4)
	 */
	constructor(
		leaf: WorkspaceLeaf,
		registry?: EngineRegistry,
		consentGate?: ConsentGate,
		nativeEngine?: NativeScopingEngine,
	) {
		super(leaf);
		this.scoping = new ScopingService(this.app);
		this.registry = registry ?? null;
		this.consentGate = consentGate ?? null;
		this.nativeEngine = nativeEngine ?? null;
		this._debouncedFollow = debounce(
			(l: WorkspaceLeaf | null) => { this._doFollow(l); },
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
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		return "Story Forge";
	}

	getIcon(): IconName {
		return ICON;
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	async onOpen(): Promise<void> {
		// Set up the DOM structure
		aug(this.contentEl).empty();
		this.contentEl.setAttribute("role", "region");
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		this.contentEl.setAttribute("aria-label", "Story Forge panel");

		// Build the panel shell
		this._buildShell();
		this._renderState({ kind: "no-note" });

		// Defer first resolve to layout-ready (ADR-5)
		this.app.workspace.onLayoutReady(() => {
			// Wire up active-leaf-change (via registerEvent)
			this.registerEvent(
				this.app.workspace.on(
					"active-leaf-change",
					(leaf: WorkspaceLeaf | null) => {
						this._debouncedFollow(leaf);
					},
				),
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

			// Initial resolution based on the current active view
			const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (mdView?.file) {
				this._resolveAndRender(mdView.file);
				this.subject = { file: mdView.file, source: "follow" };
			}
		});
	}

	async onClose(): Promise<void> {
		this._debouncedFollow.cancel();
		// ADR-7: teardown the current engine before clearing the DOM
		this.currentEngine?.teardown();
		this.currentEngine = null;
		aug(this.contentEl).empty();
		// Clear resolved-context cache and subject so a re-opened view starts
		// clean (no stale entities/error/pin carried across a close→open cycle).
		this.currentCtx = null;
		this.lastError = null;
		this.currentRecord = null;
		this.subject = { file: null, source: "follow" };
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
		} else {
			// Pin — freeze subject
			this.subject = { file: this.subject.file, source: "pinned" };
		}
		this._renderState(this._computeState());
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

		this.setSubject(file, "follow");

		// A null/absent metadata cache means the note is pre-index or unreadable:
		// render the S9 error state (with Retry), NOT S4. Only when the cache is
		// present do we classify (unknown ⇒ S4) or resolve (⇒ S6/S7). This is the
		// only place that distinguishes "not an entity" from "couldn't read".
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) {
			console.debug(
				"[StoryForge] metadata cache null for",
				file.path,
				"— rendering error state",
			);
			this.lastError = new Error("Metadata cache unavailable");
			this.currentCtx = null;
			this._renderState({
				kind: "error",
				file,
				retry: () => { this._resolveAndRender(file); },
			});
			return;
		}

		// Classify and render appropriate state
		const kind = this.scoping.classify(file);
		if (kind === "unknown") {
			this._renderState({ kind: "non-entity", file, activeKind: kind });
			return;
		}

		this._renderState({ kind: "resolving", file, activeKind: kind });
		this._resolveAndRender(file);
	}

	private _resolveAndRender(file: TFile): void {
		// Guard: a null/absent metadata cache means the note is pre-index or
		// unreadable — this is the S9 error case, distinct from a present-but-
		// empty cache (which resolves to S4/S6/S7 via classify/resolve).
		// ScopingService.resolve() is intentionally non-throwing (Phase 2), so
		// the view must detect the unreadable case here rather than via a throw.
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) {
			this.lastError = new Error("Metadata cache unavailable");
			this.currentCtx = null;
			console.debug(
				"[StoryForge] metadata cache null for",
				file.path,
				"— rendering error state",
			);
			this._renderState({
				kind: "error",
				file,
				retry: () => { this._resolveAndRender(file); },
			});
			return;
		}

		try {
			const ctx = this.scoping.resolve(file);
			this.currentCtx = ctx;
			this.lastError = null;
			this._renderState({ kind: "resolved", ctx });
		} catch (err) {
			const error = err instanceof Error ? err : new Error("Resolve failed");
			this.lastError = error;
			this.currentCtx = null;
			console.debug("[StoryForge] resolve error", error.message);
			this._renderState({
				kind: "error",
				file,
				retry: () => { this._resolveAndRender(file); },
			});
		}
	}

	private _computeState(): RenderState {
		const { file } = this.subject;
		if (!file) return { kind: "no-note" };
		if (file.extension !== "md") return { kind: "non-md", file };
		// A recorded error (incl. null metadata cache) takes precedence over
		// classification, which would otherwise report an unreadable note as
		// "not an entity" (S4) instead of the error state (S9).
		if (this.lastError) {
			return { kind: "error", file, retry: () => { this._resolveAndRender(file); } };
		}
		const kind = this.scoping.classify(file);
		if (kind === "unknown") return { kind: "non-entity", file, activeKind: kind };
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
	private _bodyEl: HTMLElement | null = null;

	private _buildShell(): void {
		const ce = aug(this.contentEl);
		ce.empty();

		// Panel-level header (vhead: "Story Forge" + icons)
		const vhead = ce.createDiv({ cls: "sf-vhead" });
		// "Story Forge" is a proper noun — not a sentence-case violation
		vhead.createSpan({ cls: "sf-vhead-name", text: "Story Forge" });
		const icons = vhead.createDiv({ cls: "sf-icons" });

		// Pin button (aria-pressed)
		const pinBtn = activeDocument.createElement("button");
		pinBtn.className = "sf-pin-btn";
		pinBtn.setAttribute("aria-pressed", "false");
		pinBtn.setAttribute("aria-label", "Pin panel to current note");
		pinBtn.textContent = "📌";
		this._pinBtn = pinBtn;
		this.registerDomEvent(pinBtn, "click", () => { this.togglePin(); });
		icons.appendChild(pinBtn);

		// Context header (chead: title + pin-tag + badge)
		const chead = ce.createDiv({ cls: "sf-chead" });
		this._titleEl = chead.createSpan({ cls: "sf-title" });
		this._pinTagEl = chead.createSpan({ cls: "sf-pin-tag sf-hidden" });
		this._badgeEl = chead.createSpan({ cls: "sf-badge" });

		// Tab strip (role=tablist; one tab "Context" in M1)
		const tabs = ce.createDiv({ cls: "sf-tabs" });
		tabs.setAttribute("role", "tablist");
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

	_renderState(state: RenderState): void {
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
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

		// Pin tag — show/hide via CSS class (no style.display)
		const showPin = this.subject.source === "pinned" && state.kind !== "no-note";
		if (showPin) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			pinTagEl.textContent = "pinned";
			pinTagEl.classList.remove("sf-hidden");
		} else {
			pinTagEl.textContent = "";
			pinTagEl.classList.add("sf-hidden");
		}
	}

	private _updateBody(state: RenderState): void {
		if (!this._bodyEl) return;
		const body = aug(this._bodyEl);
		body.empty();

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
			// "Story Forge" is a proper noun — not a sentence-case violation
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
			// S6/S7: resolved context — delegates to engine dispatch (async, fire-and-forget here)
			void this._renderResolved(body, state.ctx);
		} else if (state.kind === "error") {
			// S9: error with Retry button
			this._renderError(body, state.retry);
		}
	}

	/**
	 * Engine dispatch — replaces the M1 stub with full M2 logic.
	 *
	 * ADR-7 teardown order: teardown → body.empty() → engine.render.
	 * This order is maintained in EVERY branch.
	 *
	 * Decision tree:
	 *   1. No currentRecord → native fallback (no view tab selected)
	 *   2. No wired engine in registry → S11 engine-missing + native fallback
	 *   3. No injected registry/consentGate → native fallback (pre-M2 construction)
	 *   4. ConsentDecision:
	 *      "consented"           → teardown → empty → engine.render (S14)
	 *      "not-consented"       → S12
	 *      "drift"               → S17
	 *      "disabled"            → S16
	 *      "platform-restricted" → S11 variant
	 *      "engine-missing"      → S11
	 *      "dvjs-off"            → S15 variant
	 */
	private async _renderResolved(body: AugEl, ctx: NoteContext): Promise<void> {
		// No registry/consentGate injected (pre-T4.4 construction) → native fallback
		if (!this.registry || !this.consentGate || !this.nativeEngine) {
			this._renderResolvedLegacy(body, ctx);
			return;
		}

		const view = this.currentRecord;

		// No view tab selected → native fallback
		if (!view) {
			this.currentEngine?.teardown();
			body.empty();
			await this.nativeEngine.render(null, ctx, body);
			this.currentEngine = this.nativeEngine;
			return;
		}

		// Look up wired engine; undefined means Dataview absent or unwired kind
		const engine = this.registry.get(view.engine);
		if (!engine) {
			// S11 engine-missing — also render native fallback below the hint
			this._renderEngineMissing(body, view.engine);
			this.currentEngine?.teardown();
			await this.nativeEngine.render(view, ctx, body);
			this.currentEngine = this.nativeEngine;
			return;
		}

		// Evaluate consent state for this view
		const decision = await this.consentGate.evaluate(view);

		switch (decision.status) {
			case "consented":
				// ADR-7: teardown → empty → render (exact order per spec)
				this.currentEngine?.teardown();
				body.empty();
				// Show loading state (S13) synchronously before the async engine.render call
				this._renderLoading(body);
				await engine.render(view, ctx, body);
				this.currentEngine = engine;
				break;

			case "not-consented":
				this._renderConsentRequired(body, view);     // S12
				break;

			case "drift":
				this._renderReConsentRequired(body, view);   // S17
				break;

			case "disabled":
				this._renderDisabled(body);                  // S16
				break;

			case "platform-restricted":
				this._renderPlatformRestriction(body);       // S11 variant
				break;

			case "engine-missing":
				this._renderEngineMissing(body, view.engine); // S11
				break;

			case "dvjs-off":
				this._renderDvJsOff(body);                   // S15 variant
				break;

			default: {
				// Exhaustive guard — satisfies TypeScript's never check
				const _exhaustive: never = decision;
				console.debug("[StoryForge] unhandled consent decision", _exhaustive);
			}
		}
	}

	/**
	 * Legacy _renderResolved — used when no EngineRegistry/ConsentGate were injected
	 * (M1 stub path; removed after T4.4 main.ts rewire).
	 */
	private _renderResolvedLegacy(body: AugEl, ctx: NoteContext): void {
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

	// ---------------------------------------------------------------------------
	// Panel state renderers (S11–S18)
	// ---------------------------------------------------------------------------

	/**
	 * S11 — Engine missing or platform restriction.
	 * Matches kind-specific copy: dataview-* shows "Dataview not installed";
	 * "bases" shows "engine coming in M4" hint.
	 */
	private _renderEngineMissing(body: AugEl, kind: ViewRecord["engine"]): void {
		const empty = body.createDiv({ cls: "sf-engine-missing sf-empty" });
		empty.createDiv({ cls: "sf-empty-ic", text: "⚙" });
		if (kind === "bases") {
			empty.createDiv({ cls: "sf-empty-lead", text: "Engine coming in M4" });
			empty.createDiv({ text: "The Bases engine is not yet available." });
		} else {
			empty.createDiv({ cls: "sf-empty-lead", text: "Dataview not installed" });
			empty.createDiv({ text: "This view requires the Dataview community plugin." });
		}
	}

	/**
	 * S12 — Consent required (DataviewJS full-disclosure gate).
	 * Code is NOT executing.
	 */
	private _renderConsentRequired(body: AugEl, _view: ViewRecord): void {
		const block = body.createDiv({ cls: "sf-consent-required sf-cta-block" });
		block.createDiv({ cls: "sf-cta-title", text: "Review & Enable" });
		block.createDiv({
			cls: "sf-cta-body",
			text: "This view runs DataviewJS — arbitrary JavaScript with full vault access. The code is not running yet.",
		});
		block.createDiv({
			cls: "sf-cta-warn",
			text: "⚠ Review the source and checksum before enabling.",
		});
	}

	/**
	 * S13 — Loading (query executing).
	 * Rendered synchronously before engine.render() resolves.
	 */
	private _renderLoading(body: AugEl): void {
		const el = body.createDiv({ cls: "sf-loading sf-resolving", text: "querying…" });
		el.createDiv({ cls: "sf-skel" });
		el.createDiv({ cls: "sf-skel" });
		el.createDiv({ cls: "sf-skel" });
	}

	/**
	 * S15 variant — DataviewJS disabled in Dataview settings.
	 */
	private _renderDvJsOff(body: AugEl): void {
		const errbox = body.createDiv({ cls: "sf-dvjs-off sf-errbox" });
		errbox.createDiv({
			text: "⚠ DataviewJS is disabled in Dataview settings.",
		});
		errbox.createDiv({
			cls: "sf-hint",
			text: "Enable DataviewJS in the Dataview plugin settings to run this view.",
		});
	}

	/**
	 * S16 — View disabled (kill-switch active).
	 */
	private _renderDisabled(body: AugEl): void {
		const empty = body.createDiv({ cls: "sf-disabled sf-empty" });
		empty.createDiv({ cls: "sf-empty-ic", text: "○" });
		empty.createDiv({ cls: "sf-empty-lead", text: "View disabled" });
		empty.createDiv({
			cls: "sf-hint",
			text: "Enable this view in settings to run it.",
		});
	}

	/**
	 * S17 — Re-consent required (query drifted since last enable).
	 * Code is NOT executing.
	 */
	private _renderReConsentRequired(body: AugEl, _view: ViewRecord): void {
		const banner = body.createDiv({ cls: "sf-reconsent-required sf-warnbanner" });
		banner.createDiv({ text: "Query changed since you last enabled this view." });
		banner.createDiv({
			cls: "sf-hint",
			text: "The code is paused until you re-review it.",
		});
	}

	/**
	 * S11 variant — Platform restriction (DataviewJS on mobile).
	 */
	private _renderPlatformRestriction(body: AugEl): void {
		const empty = body.createDiv({ cls: "sf-platform-restricted sf-empty" });
		empty.createDiv({ cls: "sf-empty-ic", text: "⚙" });
		empty.createDiv({ cls: "sf-empty-lead", text: "Not available on mobile" });
		empty.createDiv({
			text: "DataviewJS views are not available on mobile devices.",
		});
	}

	private _renderError(body: AugEl, retry: () => void): void {
		const errbox = body.createDiv({ cls: "sf-errbox" });
		errbox.createDiv({ text: "⚠ Couldn't read this note's properties." });
		const btn = activeDocument.createElement("button");
		btn.className = "sf-btn";
		btn.textContent = "Retry";
		this.registerDomEvent(btn, "click", () => { retry(); });
		errbox.appendChild(btn);
	}

	private _updatePinButton(): void {
		if (!this._pinBtn) return;
		const isPinned = this.subject.source === "pinned";
		this._pinBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");
		this._pinBtn.classList.toggle("sf-pin-active", isPinned);
	}
}
