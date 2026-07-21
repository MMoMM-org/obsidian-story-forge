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
	Platform,
	TFile,
	type WorkspaceLeaf,
	type App,
	type IconName,
	debounce,
} from "obsidian";
import { SIDEBAR_VIEW_TYPE, ICON, DEBOUNCE_MS } from "pluginConstants";
import { ScopingService } from "scoping/ScopingService";
import type { NoteContext, EntityKind } from "scoping/NoteContext";
import type { PluginSettings } from "types/index";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sentinel data-view-id for the built-in Context tab.
 * Store view-ids must never equal this value (ViewImporter generates UUIDs,
 * so collisions are impossible in practice).
 */
const CTX_TAB_ID = "__context__";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Whether the panel subject is tracking the active note, pinned to one, or
 * drilled into via a link click (ADR-4). Both "pinned" and "drilled" suspend
 * the active-leaf follow path.
 */
export type SubjectSource = "follow" | "pinned" | "drilled";

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
	// 1.12.7 (CON-5) rather than bumping the manifest for an unused await.
	const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
	const existingLeaf = existing[0];
	if (existingLeaf) {
		void workspace.revealLeaf(existingLeaf);
		return;
	}

	const leaf = workspace.getRightLeaf(false);
	if (!leaf) return;

	await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
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

	// Stage 1: injected ViewStore (optional — absent → Context-only mode)
	private store: ViewStore | null;

	// T4.2: drill-in nav stack (in-memory; cleared on open-note and onClose).
	// Push the current subject.file when drilling; Back pops back one level.
	private navStack: TFile[] = [];

	// T4.2: reads the live linkClickAction setting. Threaded as a getter (not a
	// captured value) because main.ts reassigns this.settings on load — a captured
	// reference would go stale. Defaults to "drill" when no getter is injected.
	private readonly getLinkClickAction: () => PluginSettings["linkClickAction"];

	// M2: tracks the engine currently rendered into the panel body (ADR-7 teardown)
	private currentEngine: QueryEngine | null = null;
	// M2: the ViewRecord currently rendered (selected view tab)
	private currentRecord: ViewRecord | null = null;
	// M2: generation counter — incremented on every _renderResolved entry to
	// detect stale async dispatches and bail before mutating DOM/currentEngine.
	private _renderGen = 0;

	// Stage 1: selected tab state
	private selectedViewId: string | null = null;           // null = Context tab
	private _views: Record<string, ViewRecord> = {};        // cached from store
	private _tabsEl: HTMLElement | null = null;             // tab strip element
	private _unsubscribeStore: (() => void) | null = null;  // store unsubscribe handle
	private _tabsGen = 0;                                   // async-load guard

	// Debounced follow function — coalesces rapid active-leaf-change events.
	private readonly _debouncedFollow: ReturnType<
		typeof debounce<[WorkspaceLeaf | null], void>
	>;

	/**
	 * @param leaf        - Obsidian workspace leaf
	 * @param registry    - M2: injected EngineRegistry (optional until T4.4 main.ts rewire)
	 * @param consentGate - M2: injected ConsentGate (optional until T4.4 main.ts rewire)
	 * @param nativeEngine - M2: injected NativeScopingEngine fallback (optional until T4.4)
	 * @param store       - Stage 1: injected ViewStore for live tab population (optional)
	 * @param getLinkClickAction - T4.2: reads the live linkClickAction setting
	 *   (getter, not value — main.ts reassigns this.settings on load). Defaults
	 *   to "drill" when absent (keeps existing constructor calls valid).
	 */
	constructor(
		leaf: WorkspaceLeaf,
		registry?: EngineRegistry,
		consentGate?: ConsentGate,
		nativeEngine?: NativeScopingEngine,
		store?: ViewStore,
		getLinkClickAction?: () => PluginSettings["linkClickAction"],
	) {
		super(leaf);
		this.scoping = new ScopingService(this.app);
		this.registry = registry ?? null;
		this.consentGate = consentGate ?? null;
		this.nativeEngine = nativeEngine ?? null;
		this.store = store ?? null;
		this.getLinkClickAction = getLinkClickAction ?? ((): "drill" => "drill");
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

		// Stage 1: wire store subscription for live tab refresh
		if (this.store) {
			const unsubscribe = this.store.subscribe(() => { void this._reloadViews(); });
			this._unsubscribeStore = unsubscribe;
			// Register with Component so it's also released on unload (ADR-2)
			this.register(unsubscribe);
			// Initial populate
			void this._reloadViews();
		}

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

			// Initial resolution: try active MarkdownView first (avoids needing
			// getActiveFile when a markdown note was already focused). Fall back to
			// getActiveFile() which returns the last-focused file even when the
			// sidebar steal has already moved focus away from it (Bug D2 fix).
			const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const seedFile = mdView?.file ?? this.app.workspace.getActiveFile();
			if (seedFile && seedFile.extension === "md") {
				this.subject = { file: seedFile, source: "follow" };
				this._resolveAndRender(seedFile);
			}
		});
	}

	async onClose(): Promise<void> {
		this._debouncedFollow.cancel();
		// Stage 1: unsubscribe from store. Two paths call this:
		// onClose handles leaf-detach; Component.unload() handles plugin-unload
		// (via the fn queued in this.register). Both call unsubscribe; the second
		// is a safe no-op because Set.delete on a removed entry is harmless.
		this._unsubscribeStore?.();
		this._unsubscribeStore = null;
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
		// T4.2: reset nav-stack + divergence state so a re-open starts clean.
		this.navStack = [];
		this._pinDiverged = false;
		// Stage 1: reset tab state
		this.selectedViewId = null;
		this._views = {};
		this._tabsEl = null;
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
		// Divergence is meaningless outside a fresh pin — reset on every toggle.
		this._pinDiverged = false;
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

		const activeFile = (leaf.view as { file?: TFile | null }).file ?? null;

		// Guard: pinned → don't re-subject, but record whether the editor has
		// diverged from the pinned note so the S43 divergence hint can show.
		if (this.subject.source === "pinned") {
			const diverged =
				activeFile !== null &&
				this.subject.file !== null &&
				activeFile.path !== this.subject.file.path;
			if (diverged !== this._pinDiverged) {
				this._pinDiverged = diverged;
				this._renderState(this._computeState());
			}
			return;
		}

		// Guard: drilled → suspend the active-leaf follow (Back/Open-note resume it).
		if (this.subject.source === "drilled") return;

		const file = activeFile;
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

	/**
	 * T4.2: true when pinned AND the editor's active note differs from the pinned
	 * subject — drives the S43 divergence hint. Reset on pin/unpin.
	 */
	private _pinDiverged = false;

	/** Header elements — stored as refs for pin button update. */
	private _pinBtn: HTMLButtonElement | null = null;
	private _titleEl: HTMLElement | null = null;
	private _badgeEl: HTMLElement | null = null;
	private _pinTagEl: HTMLElement | null = null;
	private _backEl: HTMLElement | null = null;
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

		// Context header (chead: Back + title + pin-tag + badge)
		const chead = ce.createDiv({ cls: "sf-chead" });
		// Header Back (S41) — FIRST child, before the title. Hidden until drilled
		// with a non-empty nav stack. Lives outside _bodyEl, so its click/keydown
		// are wired directly here (registered once → leak-free).
		const backEl = chead.createSpan({ cls: "sf-back sf-hidden" });
		backEl.setAttribute("role", "button");
		backEl.setAttribute("tabindex", "0");
		backEl.setAttribute("data-sf-nav", "back");
		// "‹ Back" — proper action label; sentence-case exempt like other nav.
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		backEl.textContent = "‹ Back";
		this._backEl = backEl;
		this.registerDomEvent(backEl, "click", () => { this._navBack(); });
		this.registerDomEvent(backEl, "keydown", (e: KeyboardEvent) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			this._navBack();
		});

		this._titleEl = chead.createSpan({ cls: "sf-title" });
		this._pinTagEl = chead.createSpan({ cls: "sf-pin-tag sf-hidden" });
		this._badgeEl = chead.createSpan({ cls: "sf-badge" });

		// Tab strip (role=tablist) — Stage 1: delegated handlers registered once here
		const tabs = ce.createDiv({ cls: "sf-tabs" });
		tabs.setAttribute("role", "tablist");
		this._tabsEl = tabs;

		// Delegated click handler on the strip (registered once — avoids per-rebuild leak)
		this.registerDomEvent(tabs, "click", (e: MouseEvent) => {
			const target = (e.target as HTMLElement).closest(".sf-tab");
			if (!target) return;
			const viewId = target.getAttribute("data-view-id");
			this._selectTab(viewId === CTX_TAB_ID ? null : viewId);
		});

		// Delegated keyboard handler on the strip (registered once)
		this.registerDomEvent(tabs, "keydown", (e: KeyboardEvent) => {
			if (
				e.key !== "ArrowLeft" &&
				e.key !== "ArrowRight" &&
				e.key !== "Home" &&
				e.key !== "End"
			) {
				return;
			}
			e.preventDefault();
			const allTabs: HTMLElement[] = Array.from(
				this._tabsEl?.querySelectorAll<HTMLElement>(".sf-tab") ?? [],
			);
			if (allTabs.length === 0) return;
			const current = (e.target as HTMLElement).closest(".sf-tab");
			const idx = current ? allTabs.indexOf(current as HTMLElement) : -1;
			let next: HTMLElement | null = null;
			if (e.key === "Home") {
				next = allTabs[0] ?? null;
			} else if (e.key === "End") {
				next = allTabs[allTabs.length - 1] ?? null;
			} else if (e.key === "ArrowRight") {
				next = allTabs[(idx + 1) % allTabs.length] ?? null;
			} else {
				next = allTabs[(idx - 1 + allTabs.length) % allTabs.length] ?? null;
			}
			if (next) {
				const viewId = next.getAttribute("data-view-id");
				this._selectTab(viewId === CTX_TAB_ID ? null : viewId);
				next.focus();
			}
		});

		// Initial tab render (Context-only until store loads)
		this._renderTabs();

		// Body / tabpanel
		const body = ce.createDiv({ cls: "sf-body" });
		body.setAttribute("role", "tabpanel");
		body.setAttribute("aria-live", "polite");
		this._bodyEl = body;

		// T4.2: ONE delegated click handler on the persistent body element. It
		// survives body.empty() (which only clears children, not the body's own
		// listeners), so re-renders never leak per-link handlers. Cleaned up on
		// unload via registerDomEvent (proven by the mock's _runCleanup).
		this.registerDomEvent(body, "click", (e: MouseEvent) => {
			this._onBodyActivate(e.target, e.metaKey || e.ctrlKey);
		});
		// Enter/Space activate the focused link / nav control (keyboard parity).
		this.registerDomEvent(body, "keydown", (e: KeyboardEvent) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			this._onBodyActivate(e.target, e.metaKey || e.ctrlKey);
		});
	}

	// -------------------------------------------------------------------------
	// T4.2: delegated body activation (link drill/open + Back / Open-note nav)
	// -------------------------------------------------------------------------

	/**
	 * Route a body click/keydown to the correct action. All body-click routing
	 * lives here so the handler is registered exactly once (no per-render leak).
	 *
	 * @param target   The event target (a descendant of the body).
	 * @param modifier True when Cmd/Ctrl was held (inverts the setting).
	 */
	private _onBodyActivate(target: EventTarget | null, modifier: boolean): void {
		if (!(target instanceof HTMLElement)) return;

		// Nav controls first (Back / Open-note chrome).
		const nav = target.closest("[data-sf-nav]");
		if (nav) {
			const kind = nav.getAttribute("data-sf-nav");
			if (kind === "back") this._navBack();
			else if (kind === "open") this._openCurrentSubject();
			return;
		}

		// Link rows — resolve the stamped path/link-target to a TFile within the
		// body scope. Relation/backlink links stamp a full vault path; fact-value
		// wikilinks (fix #5) stamp only the link TARGET text (a basename), so fall
		// back to getFirstLinkpathDest which resolves basenames the way Obsidian does.
		const linkEl = target.closest("[data-sf-link]");
		if (!linkEl) return;
		const path = linkEl.getAttribute("data-sf-link");
		if (!path) return;
		const sourcePath = this.subject.file?.path ?? "";
		const file =
			this.app.vault.getAbstractFileByPath(path) ??
			this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		if (!(file instanceof TFile)) return;

		// XOR the setting with the modifier: "drill" default drills on plain click
		// and opens on modifier; "open" swaps both.
		const action = this.getLinkClickAction();
		const drill = action === "drill" ? !modifier : modifier;
		if (drill) this._drillInto(file);
		else this._openLink(file);
	}

	/**
	 * Drill into `file`: push the current subject onto the nav stack, re-subject
	 * with source "drilled" (follow suspended), and re-render.
	 */
	private _drillInto(file: TFile): void {
		if (this.subject.file) this.navStack.push(this.subject.file);
		this.setSubject(file, "drilled");
		this._resolveOrClassify(file);
		this._updatePinButton();
	}

	/** Back: pop the nav stack, re-subject to the prior note, resume follow if empty. */
	private _navBack(): void {
		const prev = this.navStack.pop();
		if (!prev) return;
		// Popped back to the drill origin (empty stack) → follow resumes;
		// otherwise stay drilled at the intermediate level.
		const source: SubjectSource = this.navStack.length === 0 ? "follow" : "drilled";
		this.setSubject(prev, source);
		this._resolveOrClassify(prev);
		this._updatePinButton();
	}

	/** Open the current subject note in the editor and resume follow. */
	private _openCurrentSubject(): void {
		if (this.subject.file) this._openLink(this.subject.file);
	}

	/**
	 * Open `file` in the editor via workspace.openLinkText, clear the nav stack,
	 * and resume follow (ADR-4 open path).
	 */
	private _openLink(file: TFile): void {
		const sourcePath = this.subject.file?.path ?? "";
		void this.app.workspace.openLinkText(file.path, sourcePath, false);
		this.navStack = [];
		this.subject = { file, source: "follow" };
		this._updatePinButton();
	}

	/**
	 * Re-render for a newly-subjected `file`: classify (unknown → S4) or resolve
	 * (→ S6/S7). Mirrors the follow-pipeline branch so drilling into a non-entity
	 * yields the existing S4 state.
	 */
	private _resolveOrClassify(file: TFile): void {
		if (file.extension !== "md") {
			this.currentCtx = null;
			this._renderState({ kind: "non-md", file });
			return;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) {
			this.lastError = new Error("Metadata cache unavailable");
			this.currentCtx = null;
			this._renderState({
				kind: "error",
				file,
				retry: () => { this._resolveAndRender(file); },
			});
			return;
		}
		const kind = this.scoping.classify(file);
		if (kind === "unknown") {
			this.currentCtx = null;
			this.lastError = null;
			this._renderState({ kind: "non-entity", file, activeKind: kind });
			return;
		}
		this._resolveAndRender(file);
	}

	// -------------------------------------------------------------------------
	// Stage 1: Tab management
	// -------------------------------------------------------------------------

	/**
	 * _renderTabs — idempotent; empties the strip and rebuilds all tabs.
	 * Views first, Context last. Reconciles stale selectedViewId.
	 */
	private _renderTabs(): void {
		if (!this._tabsEl) return;
		const strip = aug(this._tabsEl);
		strip.empty();

		// One tab per view
		for (const [id, rec] of Object.entries(this._views)) {
			const label = rec.commandName ?? this._sourceBasename(rec.source);
			const tabEl = strip.createDiv({ cls: "sf-tab" });
			tabEl.textContent = label;
			tabEl.setAttribute("role", "tab");
			tabEl.setAttribute("data-view-id", id);
			tabEl.title = label;
		}

		// Context tab (always last)
		const ctxEl = strip.createDiv({ cls: "sf-tab" });
		ctxEl.textContent = "Context";
		ctxEl.setAttribute("role", "tab");
		ctxEl.setAttribute("data-view-id", CTX_TAB_ID);
		ctxEl.title = "Context";

		// Reconcile: if selected view is gone, fall back to Context
		if (this.selectedViewId !== null && !(this.selectedViewId in this._views)) {
			this.selectedViewId = null;
			this.currentRecord = null;
		}

		this._syncTabSelection();
	}

	/** Extract the basename (no extension) from a vault path. */
	private _sourceBasename(source: string): string {
		const name = source.split("/").pop() ?? source;
		return name.endsWith(".md") ? name.slice(0, -3) : name;
	}

	/**
	 * _syncTabSelection — sets aria-selected, sf-tab-sel, and roving tabindex
	 * on every tab in the strip. Exactly one tab is always selected (Context is
	 * the guaranteed fallback).
	 */
	private _syncTabSelection(): void {
		if (!this._tabsEl) return;
		const tabs = Array.from(this._tabsEl.querySelectorAll<HTMLElement>(".sf-tab"));
		for (const tab of tabs) {
			const viewId = tab.getAttribute("data-view-id");
			const isSelected =
				viewId === CTX_TAB_ID
					? this.selectedViewId === null
					: viewId === this.selectedViewId;
			tab.setAttribute("aria-selected", isSelected ? "true" : "false");
			tab.classList.toggle("sf-tab-sel", isSelected);
			tab.setAttribute("tabindex", isSelected ? "0" : "-1");
		}
	}

	/**
	 * _selectTab — set selectedViewId + re-point currentRecord, sync UI, re-render body.
	 */
	private _selectTab(viewId: string | null): void {
		this.selectedViewId = viewId;
		this.currentRecord = viewId !== null ? (this._views[viewId] ?? null) : null;
		this._syncTabSelection();
		this._rerenderBody();
	}

	/**
	 * selectView — public entry point for the command-palette callback.
	 *
	 * Ensures views are loaded (reloads if _views is empty or the id is missing),
	 * then selects the named tab. Safe to call after activateView() opens the panel.
	 */
	async selectView(viewId: string): Promise<void> {
		if (!this.store) return;
		if (!(viewId in this._views)) await this._reloadViews();
		this._selectTab(viewId);
	}

	/**
	 * _rerenderBody — re-render only the body using the current _computeState().
	 * Does NOT rebuild the shell or tab strip.
	 */
	private _rerenderBody(): void {
		this._renderState(this._computeState());
	}

	/**
	 * _reloadViews — async guard via _tabsGen; fetches fresh views from store,
	 * re-points currentRecord, rebuilds tabs, and re-renders body when needed.
	 */
	private async _reloadViews(): Promise<void> {
		if (!this.store) return;
		const gen = ++this._tabsGen;
		const views = await this.store.getViews();
		if (gen !== this._tabsGen) return; // stale load

		const prevRecord = this.currentRecord;
		this._views = views;

		// Re-point currentRecord so enable/disable of selected view is reflected live
		this.currentRecord =
			this.selectedViewId !== null
				? (this._views[this.selectedViewId] ?? null)
				: null;

		this._renderTabs();

		// Re-render body only when the selected view's render-relevant state changed.
		// getViews() returns fresh objects on every call, so an identity check would
		// always fire and flash the panel on unrelated imports/removes. Value-compare
		// the four fields that affect which engine branch runs (source, engine, enabled,
		// okayed). Also fires when selection changed (null↔non-null).
		if (!this._renderRelevantEqual(prevRecord, this.currentRecord)) {
			this._rerenderBody();
		}
	}

	/**
	 * Returns true when two ViewRecord snapshots are identical for rendering purposes:
	 * same source, engine, enabled flag, and okayed slot (version + checksum).
	 * Both null → equal. One null → not equal (selection gained/lost).
	 */
	private _renderRelevantEqual(
		a: ViewRecord | null,
		b: ViewRecord | null,
	): boolean {
		if (a === null && b === null) return true;
		if (a === null || b === null) return false;
		if (a.source !== b.source) return false;
		if (a.engine !== b.engine) return false;
		if (a.enabled !== b.enabled) return false;
		// Compare okayed slot field-by-field (both null → equal; mixed → not equal)
		if (a.okayed === null && b.okayed === null) return true;
		if (a.okayed === null || b.okayed === null) return false;
		return a.okayed.version === b.okayed.version && a.okayed.checksum === b.okayed.checksum;
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

		// Header Back (S41 / fix #8, #9) — shown whenever there is somewhere to go
		// back to, gated on navStack (NOT source), so pinning while drilled keeps it.
		if (this._backEl) {
			const showBack = this.navStack.length > 0 && state.kind !== "no-note";
			this._backEl.classList.toggle("sf-hidden", !showBack);
		}
	}

	private _updateBody(state: RenderState): void {
		if (!this._bodyEl) return;
		const body = aug(this._bodyEl);
		body.empty();

		// T4.2: nav chrome around the body content.
		// - Back control (only while drilled with a non-empty stack)
		// - S43 pinned-divergence hint (only when pinned + editor diverged)
		// These are rendered directly into _bodyEl; the engine renders into a
		// dedicated host div (below) so its body.empty() never wipes the chrome.
		this._renderNavChrome(body, state);

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
			// S6/S7: resolved context. The engine renders into its own host div so
			// its internal body.empty() never clears the surrounding nav chrome.
			const host = aug(body.createDiv({ cls: "sf-engine-host" }));
			void this._renderResolved(host, state.ctx);
			// "Open note" footer (S41) — always available when a subject is shown.
			this._renderOpenNoteFooter(body);
		} else if (state.kind === "error") {
			// S9: error with Retry button
			this._renderError(body, state.retry);
		}
	}

	/**
	 * T4.2: render the Back control and the S43 pinned-divergence hint at the top
	 * of the body. Routed by the one delegated body handler via data-sf-nav.
	 */
	private _renderNavChrome(body: AugEl, state: RenderState): void {
		// Drill trail (S41) — "from <prev> › <current>" at the top of the body,
		// shown whenever there is a nav stack (the Back control now lives in the
		// header, not the body). `prev` is the note we drilled from (stack top).
		const prev = this.navStack.length > 0 ? this.navStack[this.navStack.length - 1] : null;
		const current = this.subject.file;
		if (prev && current && state.kind !== "no-note") {
			const trail = body.createDiv({ cls: "sf-trailrow" });
			trail.createSpan({ cls: "sf-trail-lead", text: "from " });
			const prevLnk = trail.createSpan({ cls: "sf-lrow-lnk", text: prev.basename });
			prevLnk.setAttribute("role", "link");
			prevLnk.setAttribute("tabindex", "0");
			prevLnk.setAttribute("data-sf-link", prev.path);
			trail.createSpan({ cls: "sf-trail-sep", text: " › " });
			trail.createSpan({ cls: "sf-trail-cur", text: current.basename });
		}

		// S43 pinned-divergence hint — only when pinned AND the editor has moved
		// to a different note than the pinned subject.
		if (
			this.subject.source === "pinned" &&
			this._pinDiverged &&
			state.kind !== "no-note"
		) {
			body.createDiv({
				cls: "sf-pinhint",
				text: "ⓘ Pinned — not following the active note.",
			});
		}
	}

	/** T4.2: render the "Open note" footer (S41) — opens the current subject. */
	private _renderOpenNoteFooter(body: AugEl): void {
		const foot = body.createDiv({ cls: "sf-opennote" });
		foot.setAttribute("role", "button");
		foot.setAttribute("tabindex", "0");
		foot.setAttribute("data-sf-nav", "open");
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		foot.textContent = "⤷ Open note";
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
	/**
	 * ADR-7 preamble: teardown the current engine, clear the DOM, null the ref.
	 * Called at the top of EVERY dispatch branch so the body is always clean
	 * before any new content is painted. Prevents stale DOM bleed and engine leaks.
	 */
	private _prepareBody(body: AugEl): void {
		this.currentEngine?.teardown();
		this.currentEngine = null;
		body.empty();
	}

	private async _renderResolved(body: AugEl, ctx: NoteContext): Promise<void> {
		// TODO(T4.4): delete legacy path once main.ts is rewired
		// No registry/consentGate injected (pre-T4.4 construction) → legacy stub
		if (!this.registry || !this.consentGate || !this.nativeEngine) {
			this._renderResolvedLegacy(body, ctx);
			return;
		}

		// Generation guard (FIX 3): stamp before any await so that stale dispatches
		// bail after their own awaits rather than clobbering a newer render.
		const gen = ++this._renderGen;

		const view = this.currentRecord;

		// No view tab selected → native fallback
		if (!view) {
			this._prepareBody(body);
			await this.nativeEngine.render(null, ctx, body);
			if (gen !== this._renderGen) return;
			this.currentEngine = this.nativeEngine;
			return;
		}

		// Look up wired engine; undefined means Dataview absent or unwired kind
		const engine = this.registry.get(view.engine);
		if (!engine) {
			// S11 engine-missing — ADR-7: _prepareBody → repaint hint → native render
			this._prepareBody(body);
			this._renderEngineMissing(body, view.engine);   // S11 hint repainted after empty
			await this.nativeEngine.render(view, ctx, body);
			if (gen !== this._renderGen) return;
			this.currentEngine = this.nativeEngine;
			return;
		}

		// Evaluate consent state for this view
		const decision = await this.consentGate.evaluate(view);
		if (gen !== this._renderGen) return;

		switch (decision.status) {
			case "consented":
				// ADR-7: _prepareBody → loading → render (teardown+empty inside _prepareBody)
				this._prepareBody(body);
				// Show loading state (S13) synchronously before the async engine.render call
				this._renderLoading(body);
				try {
					await engine.render(view, ctx, body);
					if (gen !== this._renderGen) return;
					// Bug C fix: remove the loading node so it doesn't persist above the output
					body.querySelector(".sf-loading")?.remove();
					this.currentEngine = engine;
				} catch (err) {
					if (gen !== this._renderGen) return;
					// Bug C fix: remove loading node before showing the error
					body.querySelector(".sf-loading")?.remove();
					const error = err instanceof Error ? err : new Error("Engine render failed");
					console.debug("[StoryForge] engine render error:", error.message);
					this._renderEngineError(body, error);
					this.currentEngine = null;
				}
				break;

			case "not-consented":
				this._prepareBody(body);
				this._renderConsentRequired(body, view);     // S12
				break;

			case "drift":
				this._prepareBody(body);
				this._renderReconsentRequired(body, view);   // S17
				break;

			case "disabled":
				this._prepareBody(body);
				this._renderDisabled(body);                  // S16
				break;

			case "platform-restricted":
				this._prepareBody(body);
				this._renderPlatformRestriction(body);       // S11 variant
				break;

			case "engine-missing":
				this._prepareBody(body);
				this._renderEngineMissing(body, view.engine); // S11
				break;

			case "dvjs-off":
				this._prepareBody(body);
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
	 * TODO(T4.4): delete this method once main.ts is rewired
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
	 * "bases" shows the S46 warn+point degrade (ADR-8, F5).
	 */
	private _renderEngineMissing(body: AugEl, kind: ViewRecord["engine"]): void {
		const empty = body.createDiv({ cls: "sf-engine-missing sf-empty" });
		empty.createDiv({ cls: "sf-empty-ic", text: "⚙" });
		if (kind === "bases") {
			if (Platform.isMobile) {
				// Mobile: core Bases can't be toggled from mobile — omit the Enable button.
				empty.createDiv({ cls: "sf-empty-lead", text: "⚙ Bases isn't available on this device" });
				empty.createDiv({
					text: "The full grid needs the core Bases plugin, which is not available on mobile. Falling back to a read-only list from metadata.",
				});
			} else {
				// Desktop: warn + point the user at enabling Bases (ADR-8: no internalPlugins).
				empty.createDiv({ cls: "sf-empty-lead", text: "⚙ Bases is off — showing a simple list" });
				empty.createDiv({
					text: "The full grid needs the core Bases plugin (Obsidian 1.12.7+). Sorting, filtering, and columns are unavailable. Falling back to a read-only list from metadata.",
				});
				// "Enable Bases" affordance: opens Obsidian settings so the user can toggle
				// core Bases themselves. app.setting is not part of the public obsidian.d.ts
				// API — accessed via optional chaining so it degrades silently on older
				// Obsidian versions or mocked environments (ADR-8: no internalPlugins).
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Enable Bases" is an action label for a proper noun
				const btn = empty.createEl("button", { cls: "sf-btn", text: "Enable Bases" });
				// ADR-2 exception: element is GC'd on body.empty(); per-render registerDomEvent would leak.
				btn.addEventListener("click", () => {
					(this.app as unknown as { setting?: { open?: () => void } }).setting?.open?.();
				});
			}
		} else {
			empty.createDiv({ cls: "sf-empty-lead", text: "Dataview not installed" });
			empty.createDiv({ text: "This view requires the Dataview community plugin." });
		}
	}

	/**
	 * S12 — Consent required (DataviewJS full-disclosure gate).
	 * Code is NOT executing.
	 */
	private _renderConsentRequired(body: AugEl, view: ViewRecord): void {
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
		// Real CTA only when a gate is injected AND a view tab is selected.
		// Context tab (id null) or pre-M2 construction (no gate) → text-only.
		const gate = this.consentGate;
		const id = this.selectedViewId;
		if (gate && id) {
			const btn = activeDocument.createElement("button");
			btn.className = "sf-cta-btn sf-btn";
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Enable" reads as a proper action label here
			btn.textContent = "Review & Enable";
			// Plain addEventListener (not registerDomEvent): the body is emptied and
			// rebuilt on every render, so per-render registration would leak (cleanups
			// only run on unload). This element is GC'd when body.empty() runs.
			btn.addEventListener("click", () => { void gate.requestConsent(id, view); });
			block.appendChild(btn);
		}
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
	private _renderReconsentRequired(body: AugEl, view: ViewRecord): void {
		const banner = body.createDiv({ cls: "sf-reconsent-required sf-warnbanner" });
		banner.createDiv({ text: "Query changed since you last enabled this view." });
		banner.createDiv({
			cls: "sf-hint",
			text: "The code is paused until you re-review it.",
		});
		// Real CTA only when a gate is injected AND a view tab is selected.
		const gate = this.consentGate;
		const id = this.selectedViewId;
		if (gate && id) {
			const btn = activeDocument.createElement("button");
			btn.className = "sf-cta-btn sf-btn";
			btn.textContent = "Re-review";
			// Plain addEventListener (see _renderConsentRequired): GC'd on next body.empty().
			btn.addEventListener("click", () => { void gate.requestReConsent(id, view); });
			banner.appendChild(btn);
		}
	}

	/**
	 * Engine render error — shown when engine.render() rejects.
	 * Uses XSS-safe createDiv text option — never innerHTML.
	 */
	private _renderEngineError(body: AugEl, _err: Error): void {
		const errbox = body.createDiv({ cls: "sf-engine-error sf-errbox" });
		errbox.createDiv({ text: "⚠ Query render failed." });
		errbox.createDiv({
			cls: "sf-hint",
			text: "The engine encountered an error. Check the view source and try again.",
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
