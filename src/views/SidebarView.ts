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
import { SIDEBAR_VIEW_TYPE, NAVIGATOR_TAB_ID, ICON, DEBOUNCE_MS } from "pluginConstants";
import { ScopingService } from "scoping/ScopingService";
import { resolveWorkspaceScope, DEFAULT_EXCLUDED_FOLDERS } from "scoping/workspaceScope";
import type { NoteContext, EntityKind } from "scoping/NoteContext";
import { CollapseStore } from "workspace/collapseStore";
import { mapSceneRow } from "workspace/sceneMapper";
import {
	timelineModel,
	plotlineModel,
	statusTally,
	stripLink,
	type LinkResolver,
} from "workspace/workspaceModel";
import { renderNavigator, type NavigatorData } from "workspace/renderNavigator";
import type { PluginSettings } from "types/index";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";
import { InspectorController } from "../inspector/InspectorController";
import { inspectorFields } from "../inspector/inspectorFields";
import { createNavigationController, type TargetKind } from "../navigation/navigationController";
import { walkTargetMarkers } from "../navigation/domTargetWalk";
import { CODEX_CARD_BODY_ATTR } from "../codex/codexTab";

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
 * Open the Workbench (the sidebar panel), or reveal the existing leaf.
 *
 * Never creates a duplicate leaf — if one already exists, it is revealed.
 * Wire this to the ribbon button and the "Story Forge: open Workbench" command.
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

/**
 * Reveal-or-create the sidebar leaf, locate the live SidebarView, and call
 * `showFile(file)` on it.
 *
 * This is the single entry point for callers that need to "open the panel
 * (if closed) and drill into a file" in one step — e.g. the Codex row-click
 * handler (T3.3). It reuses `activateView` so the reveal-or-create logic
 * stays in one place and no duplicate leaf can be created.
 *
 * The leaf lookup mirrors the pattern in main.ts:162 (getLeavesOfType →
 * view instanceof SidebarView), per SDD/ADR-4 implementation example.
 */
export async function revealAndShowFile(app: App, file: TFile): Promise<void> {
	await activateView(app);
	const leaf = app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
	if (leaf?.view instanceof SidebarView) {
		leaf.view.showFile(file);
	}
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

	// T5.2: InspectorController — hosts the edit-mode overlay for the resolved
	// entity detail. Transient dirty state lives here (CON-1: never persisted).
	// Created once; torn down on onClose/re-subject via controller.teardown().
	private _inspector: InspectorController | null = null;

	// Context-tab detail mode. false = styled read-only M3 view (default);
	// true = editable Inspector. Toggled by the header pencil button. Transient —
	// resets to view on reload; discards unsaved Inspector drafts when switched off.
	private _editMode = false;

	// T4.2: reads the live linkClickAction setting. Threaded as a getter (not a
	// captured value) because main.ts reassigns this.settings on load — a captured
	// reference would go stale. Defaults to "drill" when no getter is injected.
	private readonly getLinkClickAction: () => PluginSettings["linkClickAction"];

	// T3.5: reads the live excludedFolders setting, threaded into resolveWorkspaceScope.
	// Getter (not a captured value) for the same reason as getLinkClickAction — main.ts
	// reassigns this.settings on load. Defaults to DEFAULT_EXCLUDED_FOLDERS when absent.
	private readonly getExcludedFolders: () => readonly string[];

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

	// M5: Navigator tab state. Collapse persists per (surface, scope, group) so it
	// survives the follow re-render; the plotline filter narrows the scene list.
	private readonly _collapse = new CollapseStore();
	private _navFilter: string | null = null;
	private _navScopeKey = "none";

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
	 * @param getExcludedFolders - T3.5: reads the live excludedFolders setting.
	 *   Defaults to DEFAULT_EXCLUDED_FOLDERS when absent (keeps existing constructor
	 *   calls valid and default scoping behaviour unchanged).
	 */
	constructor(
		leaf: WorkspaceLeaf,
		registry?: EngineRegistry,
		consentGate?: ConsentGate,
		nativeEngine?: NativeScopingEngine,
		store?: ViewStore,
		getLinkClickAction?: () => PluginSettings["linkClickAction"],
		getExcludedFolders?: () => readonly string[],
	) {
		super(leaf);
		this.scoping = new ScopingService(this.app);
		this.registry = registry ?? null;
		this.consentGate = consentGate ?? null;
		this.nativeEngine = nativeEngine ?? null;
		this.store = store ?? null;
		this.getLinkClickAction = getLinkClickAction ?? ((): "drill" => "drill");
		this.getExcludedFolders = getExcludedFolders ?? ((): readonly string[] => DEFAULT_EXCLUDED_FOLDERS);
		this._debouncedFollow = debounce(
			(l: WorkspaceLeaf | null) => { this._doFollow(l); },
			DEBOUNCE_MS,
			true,
		);
		// T5.2: InspectorController — owned by this Component (auto-torn down on unload)
		this._inspector = new InspectorController(this.app, this);
	}

	// -------------------------------------------------------------------------
	// ItemView contract
	// -------------------------------------------------------------------------

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Workbench";
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
		this.contentEl.setAttribute("aria-label", "Workbench panel");

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
					// T5.2: dirty-guard — notify the Inspector first.
					// Returns true = guard fired (edit in-flight) → skip re-render so
					// we don't wipe the user's in-progress input or dirty state.
					// Returns false = all fields clean/saved → proceed with re-render.
					if (this._inspector?.notifyFileChanged(file)) return;
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
		// T5.2: tear down the Inspector (clears in-memory dirty state — CON-1)
		this._inspector?.teardown();
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
		// M5: reset Navigator state
		this._collapse.clear();
		this._navFilter = null;
		this._navScopeKey = "none";
	}

	// -------------------------------------------------------------------------
	// Subject management
	// -------------------------------------------------------------------------

	private setSubject(file: TFile | null, source: SubjectSource): void {
		// T5.2: tear down Inspector dirty state when the subject FILE changes.
		// This clears transient in-memory edits for the previous entity (CON-1).
		// Same-file follow/pin/drilled transitions preserve the dirty state.
		if (file?.path !== this.subject.file?.path) {
			this._inspector?.teardown();
		}
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

	/**
	 * Toggle the Context-tab detail between the styled read-only M3 view (default)
	 * and the editable Inspector. Tears down the Inspector first so any unsaved
	 * transient drafts are discarded (CON-1), then re-renders via the standard
	 * state pipeline (same trigger togglePin uses).
	 */
	toggleEditMode(): void {
		this._editMode = !this._editMode;
		// Discard in-flight drafts when leaving (or re-entering) edit mode.
		this._inspector?.teardown();
		this._renderState(this._computeState());
		this._updateEditButton();
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
	private _editBtn: HTMLButtonElement | null = null;
	private _titleEl: HTMLElement | null = null;
	private _badgeEl: HTMLElement | null = null;
	private _pinTagEl: HTMLElement | null = null;
	private _backEl: HTMLElement | null = null;
	private _bodyEl: HTMLElement | null = null;

	private _buildShell(): void {
		const ce = aug(this.contentEl);
		ce.empty();

		// Panel-level header (vhead: "Workbench" + icons; T2.6, mockup S95)
		const vhead = ce.createDiv({ cls: "sf-vhead" });
		// "Workbench" is a proper noun — not a sentence-case violation
		vhead.createSpan({ cls: "sf-vhead-name", text: "Workbench" });
		const icons = vhead.createDiv({ cls: "sf-icons" });

		// Pin button (aria-pressed)
		const pinBtn = activeDocument.createElement("button");
		pinBtn.className = "sf-pin-btn";
		pinBtn.setAttribute("aria-pressed", "false");
		pinBtn.setAttribute("aria-label", "Pin Workbench to current note");
		pinBtn.textContent = "📌";
		this._pinBtn = pinBtn;
		this.registerDomEvent(pinBtn, "click", () => { this.togglePin(); });
		icons.appendChild(pinBtn);

		// Edit-mode toggle (pencil) — switches the Context-tab detail between the
		// styled read-only M3 view (default) and the editable Inspector. Mirrors
		// the pin button pattern (aria-pressed + active class).
		const editBtn = activeDocument.createElement("button");
		editBtn.className = "sf-edit-btn";
		editBtn.setAttribute("aria-pressed", "false");
		editBtn.setAttribute("aria-label", "Toggle edit mode");
		editBtn.textContent = "✎";
		this._editBtn = editBtn;
		this.registerDomEvent(editBtn, "click", () => { this.toggleEditMode(); });
		icons.appendChild(editBtn);

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
	 * ADR-28 / T2.5: classify the marker kind a single DOM node carries, if any.
	 * data-sf-section-toggle, data-sf-plotline (Navigator filter rows) and
	 * data-sf-nav (Back/Open-note chrome) are all "structuralControl";
	 * data-sf-link is "name". None of these ever co-occur on the same node in
	 * the current markup.
	 *
	 * T4.1 adds the Codex card body, because the Workbench is the *second* host
	 * of that body (`codexTab.ts`, compact form) and the marker vocabulary
	 * belongs to whichever surface renders the markup. It needs nothing else
	 * here: `_onBodyActivate` already enacts inspect/open-note generically, so
	 * a card body works the moment the body renders. The collection pill is
	 * deliberately NOT listed — enacting it needs a selection store this view
	 * does not have yet, and claiming a kind we cannot act on would only turn
	 * "nothing happens" into a different flavour of nothing. It lands with the
	 * Workbench's own Codex tab (Phase 7's surface binding).
	 *
	 * The card body and the name inside it are separate elements, so
	 * name-over-card-body precedence comes from the nearest-first walk, not
	 * from this list's order (ADR-28).
	 */
	private _markerKindOf(el: HTMLElement): TargetKind | null {
		if (el.hasAttribute("data-sf-section-toggle")) return "structuralControl";
		if (el.hasAttribute("data-sf-plotline")) return "structuralControl";
		if (el.hasAttribute("data-sf-nav")) return "structuralControl";
		if (el.hasAttribute("data-sf-link")) return "name";
		if (el.hasAttribute(CODEX_CARD_BODY_ATTR)) return "cardBody";
		return null;
	}

	/**
	 * Resolve `nearest`'s target path to a `TFile`. A name carries it in
	 * `data-sf-link`, a Codex card body in `data-sf-card-body` — one attribute
	 * per element, so which one is present says nothing about precedence (the
	 * walk already settled that); both name the same kind of thing.
	 *
	 * Relation/backlink links stamp a full vault path; fact-value wikilinks
	 * (fix #5) stamp only the link TARGET text (a basename), so fall back to
	 * getFirstLinkpathDest which resolves basenames the way Obsidian does.
	 */
	private _resolveLinkFile(nearest: HTMLElement | null): TFile | null {
		const path =
			nearest?.getAttribute("data-sf-link") ?? nearest?.getAttribute(CODEX_CARD_BODY_ATTR);
		if (!path) return null;
		const sourcePath = this.subject.file?.path ?? "";
		const file =
			this.app.vault.getAbstractFileByPath(path) ??
			this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Enact an "operateControl" outcome: `nearest` carries exactly one of the
	 * three structural markers `_markerKindOf` recognises — determine which and
	 * run the same handling `_onBodyActivate` used to run inline.
	 */
	private _operateControl(nearest: HTMLElement | null): void {
		if (!nearest) return;

		if (nearest.hasAttribute("data-sf-section-toggle")) {
			this._toggleSection(nearest);
			// M5: persist Navigator collapse so it survives the follow re-render.
			if (this.selectedViewId === NAVIGATOR_TAB_ID) {
				const groupKey = nearest.getAttribute("data-sf-group-key");
				if (groupKey) this._collapse.toggle("navigator", this._navScopeKey, groupKey);
			}
			return;
		}

		// M5: Navigator plotline filter rows — narrow (or clear via the "All" row).
		if (this.selectedViewId === NAVIGATOR_TAB_ID && nearest.hasAttribute("data-sf-plotline")) {
			const val = nearest.getAttribute("data-sf-plotline") ?? "";
			this._navFilter = val === "" ? null : val;
			this._rerenderBody();
			return;
		}

		const navKind = nearest.getAttribute("data-sf-nav");
		if (navKind === "back") this._navBack();
		else if (navKind === "open") this._openCurrentSubject();
	}

	/**
	 * ADR-28: classify-then-act via the shared `NavigationController`. All
	 * body-click routing still lives here (registered exactly once — no
	 * per-render leak) but the per-attribute `closest()` chain is gone: every
	 * click is classified from its nearest-first marker chain, and the
	 * resolved action decides what happens. "inspect" is the Workbench's own
	 * meaning — drill in place and suspend follow (`_drillInto`, unchanged);
	 * "openNote" and "operateControl" are enacted here because they need the
	 * specific file / control identity the controller never sees.
	 *
	 * @param target   The event target (a descendant of the body).
	 * @param modifier True when Cmd/Ctrl was held (inverts the setting).
	 */
	private _onBodyActivate(target: EventTarget | null, modifier: boolean): void {
		if (!(target instanceof HTMLElement) || !this._bodyEl) return;

		const { markers, nearest } = walkTargetMarkers(target, this._bodyEl, (el) => this._markerKindOf(el));

		const controller = createNavigationController({
			getLinkClickAction: this.getLinkClickAction,
			inspect: (): void => { this._inspectInWorkbench(nearest); },
		});
		const outcome = controller.handle(markers, modifier);

		switch (outcome.action) {
			case "openNote": {
				const file = this._resolveLinkFile(nearest);
				if (file) this._openLink(file);
				break;
			}
			case "operateControl":
				this._operateControl(nearest);
				break;
			case "inspect":
				// Already invoked via deps.inspect inside controller.handle().
				break;
			case "focusField":
			case "none":
				break;
		}
	}

	/**
	 * The Workbench's "inspect": drill in place (re-subject + suspend follow
	 * until Back/open-note resumes it — `_drillInto`, unchanged behaviour).
	 * Drilling from the Navigator switches to the Context tab first so the
	 * note renders in the Context detail rather than back into the Navigator.
	 */
	private _inspectInWorkbench(nearest: HTMLElement | null): void {
		const file = this._resolveLinkFile(nearest);
		if (!file) return;
		if (this.selectedViewId === NAVIGATOR_TAB_ID) {
			this.selectedViewId = null;
			this.currentRecord = null;
			this._syncTabSelection();
		}
		this._drillInto(file);
	}

	/**
	 * Toggle a collapsible section's body open/closed in place.
	 *
	 * Pure-DOM: flips the `sf-sec-body--collapsed` class and syncs the chevron +
	 * aria state. No engine re-render — collapse is a transient view concern that
	 * resets when the panel re-subjects to a new note (expected for a follow panel).
	 */
	private _toggleSection(headEl: HTMLElement): void {
		const sectionEl = headEl.closest(".sf-section");
		const bodyEl = sectionEl?.querySelector(".sf-sec-body");
		if (!(bodyEl instanceof HTMLElement)) return;
		const collapsed = bodyEl.classList.toggle("sf-sec-body--collapsed");
		bodyEl.setAttribute("aria-hidden", collapsed ? "true" : "false");
		headEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
		const chev = headEl.querySelector(".sf-sec-chev");
		if (chev) chev.textContent = collapsed ? "▶" : "▼";
	}

	/**
	 * Re-subject the panel to `file` by delegating to `_drillInto`.
	 *
	 * Called by external entry points (e.g. the Codex row-click handler, T3.3)
	 * that have already revealed the sidebar leaf. This is the public seam
	 * described in SDD/ADR-4: all drill semantics (nav-stack push, drilled
	 * follow-suspension, unresolved fall-throughs) are inherited from the
	 * existing private `_drillInto` — nothing is reimplemented here.
	 *
	 * [ref: PRD/AC-F2.2] — panel re-subjects on showFile.
	 * [ref: PRD/AC-F2.6] — unresolved/non-md yields M3 state, never throws.
	 */
	public showFile(file: TFile): void {
		this._drillInto(file);
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

		// Context tab
		const ctxEl = strip.createDiv({ cls: "sf-tab" });
		ctxEl.textContent = "Context";
		ctxEl.setAttribute("role", "tab");
		ctxEl.setAttribute("data-view-id", CTX_TAB_ID);
		ctxEl.title = "Context";

		// M5: fixed Navigator tab (always last) — a built-in surface, not a store view.
		const navEl = strip.createDiv({ cls: "sf-tab" });
		navEl.textContent = "Navigator";
		navEl.setAttribute("role", "tab");
		navEl.setAttribute("data-view-id", NAVIGATOR_TAB_ID);
		navEl.title = "Navigator";

		// Reconcile: if a selected *store* view is gone, fall back to Context. The
		// built-in Navigator tab is exempt (it is never a member of _views).
		if (
			this.selectedViewId !== null &&
			this.selectedViewId !== NAVIGATOR_TAB_ID &&
			!(this.selectedViewId in this._views)
		) {
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

		// M5: the Navigator tab renders regardless of the active note's kind (it
		// falls back to whole-vault scope), so it short-circuits the state routing.
		if (this.selectedViewId === NAVIGATOR_TAB_ID) {
			this._renderNavigatorTab(body);
			return;
		}

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
	 * M5: compute + render the Navigator tab (ADR-10). Resolves the active note's
	 * scope, maps scenes → rows, builds the act/plotline models + status tally,
	 * applies the plotline filter, and renders via renderNavigator. Follows the
	 * active note because _updateBody is driven by the follow pipeline.
	 */
	private _renderNavigatorTab(body: HTMLElement): void {
		const activeFile = this.app.workspace.getActiveFile();
		const { scope, scenes } = resolveWorkspaceScope(this.app, activeFile, this.getExcludedFolders());
		this._navScopeKey = scope.kind === "none" ? "none" : `${scope.kind}:${scope.ref.path}`;

		const sourcePath = activeFile?.path ?? "";
		const resolve: LinkResolver = (t) =>
			this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);

		const rows = scenes.map((f) => mapSceneRow(this.app, f));
		const filter = this._navFilter;
		const actRows =
			filter === null ? rows : rows.filter((r) => r.plotlines.map(stripLink).includes(filter));

		const data: NavigatorData = {
			actGroups: timelineModel(actRows),
			plotlineGroups: plotlineModel(rows, resolve),
			tally: statusTally(rows),
		};
		renderNavigator(
			body,
			data,
			{ plotlineFilter: filter },
			{ isCollapsed: (g) => this._collapse.isCollapsed("navigator", this._navScopeKey, g) },
		);
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

		// No view tab selected (Context tab) → View/Edit toggle owns the detail.
		//   view mode (default): the styled read-only M3 panel via nativeEngine.render
		//     (sections + clickable wikilink lists — the surface the M3 renderers own).
		//   edit mode: the Inspector renders editable scalar/enum inputs (F6) + read-only
		//     relation/list chips (F8), exactly once (no double-render).
		// The pencil toggle in the header flips _editMode and re-renders through here.
		if (!view) {
			this._prepareBody(body);
			// Edit mode only applies to inspectable entity notes; for anything else
			// (unknown kind, no fields) fall through to the styled read-only view so
			// the panel is never blank.
			const inspectable =
				ctx.activeKind !== "unknown" && inspectorFields(ctx.activeKind).length > 0;
			if (this._editMode && inspectable) {
				this._renderInspector(body, ctx);
			} else {
				await this.nativeEngine.render(null, ctx, body);
				if (gen !== this._renderGen) return;
				this.currentEngine = this.nativeEngine;
			}
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

	/**
	 * T5.3: Render the unified Inspector detail (all fields, not just editable scalars).
	 *
	 * The Inspector OWNS the entire no-view-tab detail:
	 *   - scalar/enum (text, number, select) → editable inputs (F6)
	 *   - relation/list/tags/fixed → read-only chips using M3 helpers (F8)
	 *
	 * nativeEngine.render is NOT called before this in the !view branch — every
	 * field is rendered exactly once (no duplication). nativeEngine.render continues
	 * to run in the view-selected + engine-missing branches.
	 *
	 * Only shown in the Context tab (no view tab selected).
	 */
	private _renderInspector(body: AugEl, ctx: NoteContext): void {
		if (!this._inspector) return;
		if (ctx.activeKind === "unknown") return;
		// T5.3: pass ALL fields (scalar editable + read-only relation/list/tags/fixed).
		// The controller routes each field to the appropriate render path.
		const allFields = inspectorFields(ctx.activeKind);
		if (allFields.length === 0) return;
		const host = body.createDiv({ cls: "sf-inspector-host" });
		this._inspector.render(host, ctx, allFields);
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

	private _updateEditButton(): void {
		if (!this._editBtn) return;
		this._editBtn.setAttribute("aria-pressed", this._editMode ? "true" : "false");
		this._editBtn.classList.toggle("sf-edit-active", this._editMode);
	}
}
