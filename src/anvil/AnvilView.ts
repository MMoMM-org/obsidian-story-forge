/**
 * AnvilView — the main-area workspace host (M5 read views + M6 interactive views).
 *
 * One polymorphic `ItemView` (ADR-16) with a header toolbar. It follows the active
 * note (active-leaf-change), resolves scope via the shared core, maps rows, and routes
 * to one of five layouts (tab strip built by `anvilTabs.ts`, S91/S94):
 *
 *   codex     — collection grid (Phase 4, `codexTab.ts`)
 *   timeline  — rail OR swimlane (read; M6 adds swimlane + zoom)
 *   plotlines — Plotlines list (read, M5)
 *   kanban    — status columns, drag→status+order write-back (M6); displays as "Board" (S91)
 *   plotgrid  — read-only Scene × Plotline coverage matrix (M6; editable/configurable → GH #8)
 *
 * The view OWNS one `InteractionHandler` (constructed in onOpen, destroyed in onClose —
 * CON-4) used by the Kanban board (the sole write surface). A Kanban write:
 *   - is committed via the single seam (`commit` / `commitMany`),
 *   - optimistically re-renders (`onAfter`),
 *   - on failure marks the card + fires a `Notice` (ADR-24),
 *   - announces into an `aria-live=polite` region on the keyboard path (F8).
 *
 * A debounced `metadataCache.changed` subscription reconciles this view and refreshes any
 * other open AnvilView on the same scope (hybrid re-render, ADR-22; last-write-wins,
 * ADR-25).
 *
 * Across ALL five layouts the view also hosts the **editor pane** (T5.1,
 * `editor/editorPane.ts`): `inspect(file)` is where every drill click lands, and the pane
 * renders below the layout (S92), beside it (S99) or instead of it (S100) per the persisted
 * dock. It is not a Codex-only surface, because the drill seam is not — a name click in
 * Timeline, Plotgrid, Plotlines or Board must show its entry somewhere IN the Anvil, which
 * is the whole reason inspect was inert until this pane existed (decision 2026-07-31).
 *
 * Moved from `src/workspace/WorkspaceView.ts` to `src/anvil/AnvilView.ts`, with the class
 * itself renamed `WorkspaceView` → `AnvilView` and `WorkspaceLayout` → `AnvilLayout` in the
 * same diff (spec 008, ADR-27 — "one large rename diff, taken while the file is open
 * anyway"). This is now the host for the Anvil, the main-window surface. The view type id
 * is unaffected by any of this: `WORKSPACE_VIEW_TYPE` keeps its frozen string value (CON-4)
 * and now lives in `pluginConstants.ts` alongside the other view type ids — the constant's
 * *name* still tracks the id, not the class, matching `SIDEBAR_VIEW_TYPE`.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-2, ADR-3, ADR-13
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-16, ADR-20, ADR-21, ADR-22, ADR-24, ADR-25
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-27
 */

import { Component, ItemView, Notice, TFile, debounce, type WorkspaceLeaf } from "obsidian";
import { DEBOUNCE_MS, ICON, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import { resolveWorkspaceScope, resolvePlotlineScope, DEFAULT_EXCLUDED_FOLDERS } from "scoping/workspaceScope";
import { mapSceneRow } from "workspace/sceneMapper";
import {
	timelineModel,
	plotlineModel,
	kanbanModel,
	plotgridModelFromScope,
	swimlaneGrid,
	type LinkResolver,
	type SwimlaneKey,
	type SceneRow,
} from "workspace/workspaceModel";
import { renderTimeline } from "workspace/renderTimeline";
import { renderPlotlines } from "workspace/renderPlotlines";
import { renderKanban, type RenumberWrite } from "workspace/renderKanban";
import { renderPlotgrid } from "workspace/renderPlotgrid";
import { createTimelineZoom } from "workspace/timelineZoom";
import { InteractionHandler } from "workspace/interactionHandler";
import {
	commit,
	commitMany,
	type CommitEntry,
	type CommitError,
	type CommitOptions,
	type CommitResult,
} from "../inspector/frontmatterWriter";
import type { JournalGroup, PendingReason } from "undo/journalTypes";
import type { UndoJournal } from "undo/undoJournal";
import { CollapseStore } from "workspace/collapseStore";
import { buildAnvilTabStrip, isAnvilTab } from "./anvilTabs";
import { createNavigationController } from "navigation/navigationController";
import { walkTargetMarkers, type MarkerKindOf } from "navigation/domTargetWalk";
import { linkContextMenuHandler } from "navigation/linkContextMenu";
import { isActivationKey } from "navigation/keyboardRouting";
import { ANVIL_MARKERS, createMarkerKindOf } from "navigation/markerVocabulary";
import {
	BUILT_IN_COLLECTIONS,
	CODEX_CARD_BODY_ATTR,
	CODEX_COLLECTION_ATTR,
	CodexSelectionStore,
	renderCodexTab,
	type CodexCollection,
	type CodexTabSplit,
} from "codex/codexTab";
import { CODEX_CARD_SELECT_ATTR } from "codex/cardSelector";
import { CODEX_CHANGE_TAG_ATTR } from "codex/codexEmptyState";
import { CODEX_HINT_DISMISS_ATTR } from "codex/basesHint";
import { createNoteIndex, type CodexNoteIndex } from "codex/noteIndex";
import {
	EDITOR_PATH_ATTR,
	EDITOR_TOOL_ATTR,
	EditorPaneStore,
	isEditorTool,
	renderEditorPane,
	renderFieldSections,
	type EditorDock,
	type EditorPaneMode,
} from "editor/editorPane";
import { FIELD_CONTROL_ATTR } from "editor/fieldControls";
import { FieldCommitter } from "editor/fieldCommit";
import { buildFieldModel } from "editor/fieldModel";
import { GENERATED_UI_HINTS } from "editor/generatedUiHints";
import { createMediaSeams } from "editor/mediaPicker";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import type { FileClassCache } from "fileclass/fileClassVault";
import { createLinkedImageResolver } from "panel/assetResolver";
import { createCardTileField } from "codex/cardTileField";
import type { BasesCapability } from "bases/basesCapability";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts;
// same local declaration `codexTab.ts` and `panel/components.ts` use).
declare const activeDocument: Document;

export type AnvilLayout = "codex" | "timeline" | "plotlines" | "kanban" | "plotgrid";

/** The Timeline sub-mode toggle (ADR-16 / mockup S62 vs S76). */
type TimelineMode = "rail" | "swimlane";

/** The status vocabulary that seeds the Kanban columns (mirrors schema/scene.json). */
const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

/** The `order` field spec used by the Kanban renumber path. */
const ORDER_FIELD = { name: "order", type: "number" as const };
/** How long a deferred reconcile waits for a gesture-end event before it runs anyway. */
const DEFER_FALLBACK_MS = 1500;

/**
 * AnvilViewOpts — grouped by concern (spec 008 Phase 4 closeout).
 *
 * Ten flat getter/callback fields accumulated across four tasks (T3.5, T4.1,
 * T4.4, T4.6); each addition individually followed the same convention (an
 * injected getter or callback with a documented default), but left alone the
 * list would keep growing flat — Phase 5's editor pane (pane state, dock,
 * selection) is the next contributor, and undifferentiated from the rest it
 * would read as "just more Codex fields". Grouping by concern gives Phase 5 a
 * new `editor?: { ... }` group instead of four more top-level fields.
 *
 * Every getter is a getter (not a captured value) for the same reason across
 * every group: main.ts reassigns `this.settings` on load/save, so a captured
 * value would go stale. `drill` stays top-level — it is the one seam that
 * cuts across every layout (Codex card body, Timeline/Kanban/Plotlines scene
 * click), not a concern of any single group.
 *
 * A group being entirely absent must behave exactly as all of its member
 * fields being absent does today — every default below is unchanged from
 * before this reshape, only its home moved.
 */
export interface AnvilViewOpts {
	/**
	 * The Anvil's "inspect" (ADR-28). Defaults to a deliberate no-op: the host
	 * wires it. `main.ts` injects `view.inspect(file)` — the editor pane, in this
	 * view, opening no other leaf (PRD/F2) — at the construction site (T5.1), so
	 * the production path is visible there rather than hidden in a default, and
	 * a test can observe inspection through the same seam.
	 */
	drill?: (file: TFile) => void;

	/**
	 * The plugin's undo journal (spec 009, ADR-43). The Kanban writes join each gesture's group
	 * (ADR-38), and the view registers its probe and the Kanban flusher (ADR-39). Absent: no
	 * grouping and no registration; every write is still recorded by the writer.
	 */
	undo?: UndoJournal;

	/** Live plugin settings the Anvil reads on every render (T3.5). */
	settings?: {
		/** Reads the live link-click setting (getter — main.ts reassigns settings). */
		getLinkClickAction?: () => "drill" | "open";
		/** Reads the live `cardTitleOpensNote` setting, per click. Defaults to `true`. */
		getCardTitleOpensNote?: () => boolean;
		/**
		 * Reads the live excludedFolders setting, threaded into resolveWorkspaceScope
		 * and resolvePlotlineScope. Defaults to DEFAULT_EXCLUDED_FOLDERS so existing
		 * construction sites are unaffected.
		 */
		getExcludedFolders?: () => readonly string[];
	};

	/** Codex tab concerns: collection list, Card choice, tag settings (T4.1/T4.4/T4.6). */
	codex?: {
		/**
		 * Reads the live Codex collection list (T4.1) — Phase 7's Library replaces the
		 * shipped defaults with store-backed records and must not require a reopen.
		 * Defaults to `BUILT_IN_COLLECTIONS`.
		 */
		getCollections?: () => readonly CodexCollection[];
		/**
		 * Reads the live per-collection Card choice (T4.4), keyed by collection id.
		 * Defaults to `{}` — every collection renders the registry default (Hero)
		 * until the user picks one.
		 */
		getCardByCollection?: () => Readonly<Record<string, string>>;
		/**
		 * Persist a Card choice for a collection (T4.4) — write-through to settings
		 * only, never to a note's frontmatter (CON-2). Defaults to a no-op.
		 */
		onCardSelect?: (collectionId: string, cardId: string) => void;
		/**
		 * Open Settings so the user can change a collection's tag (T4.6, S98's
		 * "Change tag"). Defaults to a no-op. Per-collection settings UI does not
		 * exist yet (deferred to Phase 7's Library) — main.ts's real implementation
		 * opens Settings at the plugin's own tab, the closest anchor that exists today.
		 */
		onChangeTag?: (collectionId: string) => void;
	};

	/** Editor pane concerns: the persisted dock (T5.1, ADR-33). */
	editor?: {
		/**
		 * Reads the live dock (`PluginSettings.editorDock`). Defaults to
		 * `"bottom"` (S92), the shipped settings default.
		 */
		getDock?: () => EditorDock;
		/**
		 * The plugin's FileClass cache, where the pane and the Codex's Cards get
		 * the field declarations they render (T5.3, T6.4). Absent, no note has a
		 * FileClass: the pane shows the note's own keys, Cards the shipped names.
		 */
		fileClasses?: FileClassCache;
		/**
		 * Persist a dock change — write-through to settings only, never to a
		 * note's frontmatter (CON-2). Defaults to a no-op, which makes the dock
		 * effectively fixed for a host that has not wired persistence: better
		 * than an in-memory dock that silently forgets itself on reload.
		 *
		 * ADR-33: this is the ONLY thing that ever changes the dock. Nothing
		 * calls it in response to a resize, and nothing ever will.
		 */
		onDockChange?: (dock: EditorDock) => void;
	};

	/** Bases capability + hint dismissal (T4.6, ADR-36). */
	bases?: {
		/**
		 * Reads the live Bases capability (enabled/disabled/absent —
		 * `bases/basesCapability.ts`). Defaults to `"enabled"` — the safe default
		 * that never shows a hint.
		 */
		getCapability?: () => BasesCapability;
		/** Reads the live set of dismissed hint ids (`PluginSettings.dismissedHints`). Defaults to none dismissed. */
		getDismissedHints?: () => readonly string[];
		/**
		 * Persist a hint dismissal — write-through to settings only, never to a
		 * note's frontmatter (CON-2). Defaults to a no-op.
		 */
		onDismissHint?: (hintId: string) => void;
	};
}

/** The writer's options for a write in `group` (none without a group). */
function groupOption(group: JournalGroup | null): CommitOptions | undefined {
	return group ? { group } : undefined;
}

function isSwimlaneKey(v: unknown): v is SwimlaneKey {
	return v === "pov" || v === "location" || v === "plotline";
}

export class AnvilView extends ItemView {
	private _layout: AnvilLayout = "timeline";
	private _timelineMode: TimelineMode = "rail";
	/** Swimlane grouping key, persisted per-scope (ADR-20). */
	private readonly _swimKeyByScope = new Map<string, SwimlaneKey>();
	private readonly _collapse = new CollapseStore();
	/** Which Codex collection this Anvil is showing — survives follow re-renders (T4.1). */
	private readonly _codexSelection = new CodexSelectionStore();
	/** Which note the editor pane is showing, and whether it is fullscreen (T5.1). */
	private readonly _editor = new EditorPaneStore();
	/** The plugin's FileClass cache, for the pane and the Codex's Cards (T6.4). */
	private readonly fileClasses: FileClassCache | undefined;
	/**
	 * Writes issued for the open note that have not landed yet (T5.4): field
	 * name → the value on its way to the file.
	 *
	 * Owned by the VIEW rather than by the `FieldCommitter` that issued them,
	 * because a render replaces the committer — so committer-held state would be
	 * dropped at exactly the moment it is needed. Two jobs, one map: it is the
	 * re-render guard, and it is what a render overlays on `metadataCache` so a
	 * pane rebuilt mid-write does not show the pre-edit value.
	 */
	private readonly _inFlight = new Map<string, unknown>();
	/** The note `_inFlight` belongs to — a different note's writes are never overlaid. */
	private _inFlightPath: string | null = null;
	/** A reconcile that arrived while a write was unresolved, owed once it settles (T5.4). */
	private _reconcileOwed = false;
	/**
	 * Timer holding an owed reconcile back while focus sits on another element
	 * of this view (a header tool, a card) so the click that put it there can
	 * land. Null when nothing is deferred.
	 */
	private _deferTimer: number | null = null;
	/**
	 * The pane control that holds typed text not yet committed (its `change` has
	 * not fired). Set by a delegated `input`, cleared by `change`/`focusout`. A
	 * rebuild would destroy it, so the debounced reconcile waits (SDD: "the
	 * editor keeps focus").
	 */
	private _draftEl: HTMLElement | null = null;
	/**
	 * A debounced trigger that could change what the pane shows has arrived since
	 * the last render: the shown note changed, or the active leaf did. A change
	 * to some OTHER note leaves this false — it concerns the grid, never the pane.
	 */
	private _paneStale = false;
	/** Vault-backed note index feeding the pure collection resolver. Built in onOpen. */
	private _noteIndex: CodexNoteIndex | null = null;
	private _scopeKey = "none";
	private _bodyEl: HTMLElement | null = null;
	private _toggleEl: HTMLElement | null = null;
	private _timelineBarEl: HTMLElement | null = null;
	private _keySelectEl: HTMLSelectElement | null = null;
	private _zoomSlotEl: HTMLElement | null = null;
	private _liveEl: HTMLElement | null = null;
	private _handler: InteractionHandler | null = null;
	private readonly _undo: UndoJournal | undefined;
	/** Releases the probes and the flusher registered with `_undo` (ADR-39). */
	private _undoRegistrations: (() => void)[] = [];
	/**
	 * Set when `onClose` starts. A Kanban flush can land after that (ADR-52): renders and
	 * announcements are then skipped, and only a failure is still reported (a Notice).
	 */
	private _closed = false;
	/** Child Component owning the current zoom listeners. Replaced on every rail render. */
	private _zoomChild: Component | null = null;
	private readonly getLinkClickAction: () => "drill" | "open";
	private readonly getCardTitleOpensNote: () => boolean;
	private readonly _drill: (file: TFile) => void;
	private readonly getExcludedFolders: () => readonly string[];
	private readonly getCollections: () => readonly CodexCollection[];
	private readonly getCardByCollection: () => Readonly<Record<string, string>>;
	private readonly onCardSelect: (collectionId: string, cardId: string) => void;
	private readonly getBasesCapability: () => BasesCapability;
	private readonly getDismissedHints: () => readonly string[];
	private readonly onDismissHint: (hintId: string) => void;
	private readonly onChangeTag: (collectionId: string) => void;
	private readonly getEditorDock: () => EditorDock;
	private readonly onEditorDockChange: (dock: EditorDock) => void;
	private readonly _debouncedRender: ReturnType<typeof debounce<[], void>>;

	constructor(leaf: WorkspaceLeaf, opts?: AnvilViewOpts) {
		super(leaf);
		this._undo = opts?.undo;
		this.getLinkClickAction = opts?.settings?.getLinkClickAction ?? ((): "drill" => "drill");
		this.getCardTitleOpensNote = opts?.settings?.getCardTitleOpensNote ?? ((): boolean => true);
		// ADR-28: this is the Anvil's "inspect" implementation. It used to default to
		// revealAndShowFile(app, file), which opened/revealed the Workbench leaf — the
		// reported regression (a click in the Anvil must target no other leaf). Between
		// T2.5 and T5.1 it defaulted to a deliberate no-op, recorded as a decision
		// (2026-07-31): there was nowhere IN the Anvil to show an inspection, and a
		// click that does nothing is honest where a click that jumps a panel is not.
		//
		// T5.1 built that somewhere — the editor pane — and FEEDS THE SEAM at the
		// single construction site (`main.ts`) rather than changing this default.
		// The default stays a no-op deliberately (ruling on the T5.1 review): if it
		// resolved to `this.inspect(file)`, deleting the injection in `main.ts`
		// would change nothing observable and "a name click is no longer a no-op"
		// would be carried by a default nobody asked for — unfalsifiable. With the
		// no-op default, `test/main.editorPane.test.ts` fails the moment the
		// construction site stops feeding the seam. A host that wants inspection
		// wires it; that is what the seam is for.
		this._drill = opts?.drill ?? ((): void => {});
		this.getExcludedFolders = opts?.settings?.getExcludedFolders ?? ((): readonly string[] => DEFAULT_EXCLUDED_FOLDERS);
		this.getCollections = opts?.codex?.getCollections ?? ((): readonly CodexCollection[] => BUILT_IN_COLLECTIONS);
		this.getCardByCollection = opts?.codex?.getCardByCollection ?? ((): Readonly<Record<string, string>> => ({}));
		this.onCardSelect = opts?.codex?.onCardSelect ?? ((): void => {});
		this.getBasesCapability = opts?.bases?.getCapability ?? ((): BasesCapability => "enabled");
		this.getDismissedHints = opts?.bases?.getDismissedHints ?? ((): readonly string[] => []);
		this.onDismissHint = opts?.bases?.onDismissHint ?? ((): void => {});
		this.onChangeTag = opts?.codex?.onChangeTag ?? ((): void => {});
		this.getEditorDock = opts?.editor?.getDock ?? ((): EditorDock => "bottom");
		this.fileClasses = opts?.editor?.fileClasses;
		this.onEditorDockChange = opts?.editor?.onDockChange ?? ((): void => {});
		this._debouncedRender = debounce((): void => { this._reconcile(); }, DEBOUNCE_MS, true);
	}

	getViewType(): string {
		return WORKSPACE_VIEW_TYPE;
	}

	/**
	 * Stable on purpose: Obsidian reads the title and icon when the leaf opens and
	 * has no public way to refresh them, so per-tab values went stale on the first
	 * tab switch. The Anvil's own tab strip shows which tab is active.
	 */
	getDisplayText(): string {
		return "Anvil";
	}

	getIcon(): string {
		return ICON;
	}

	async onOpen(): Promise<void> {
		const ce = this.contentEl;
		ce.empty();
		ce.addClass("sf-ws");

		const head = ce.createDiv({ cls: "sf-ws-head" });
		head.createSpan({ cls: "sf-ws-brand", text: "Story Forge" });

		// Mode toggle — one pill per tab, built from the anvilTabs.ts registry (S91 order).
		// Existing data-ws-layout hooks (timeline/plotlines/kanban/plotgrid) are unchanged,
		// so delegated routing + existing M5/M6 tests keep working untouched.
		this._toggleEl = buildAnvilTabStrip(head);

		// Timeline sub-controls (one row, mockup M1): Rail|Swimlane toggle +
		// group-by dropdown + inline zoom controls. Only shown for the Timeline
		// layout (visibility synced in _syncToggle).
		const tlBar = head.createDiv({ cls: "sf-ws-tlbar" });
		const modeGroup = tlBar.createDiv({ cls: "sf-ws-tlmode" });
		modeGroup.createEl("span", { cls: "sf-ws-tlmode-opt", text: "Rail" }).setAttribute("data-ws-tlmode", "rail");
		modeGroup.createEl("span", { cls: "sf-ws-tlmode-opt", text: "Swimlane" }).setAttribute("data-ws-tlmode", "swimlane");

		// Group-by dropdown (Obsidian .dropdown). Enabled only in Swimlane mode.
		const keySelect = tlBar.createEl("select", { cls: "dropdown sf-ws-tlkey-select" });
		keySelect.setAttribute("aria-label", "Group swimlanes by");
		([["pov", "POV"], ["location", "Location"], ["plotline", "Plotline"]] as const).forEach(([k, label]) => {
			keySelect.createEl("option", { text: label, value: k });
		});
		this.registerDomEvent(keySelect, "change", () => {
			const k = keySelect.value;
			if (isSwimlaneKey(k)) {
				this._swimKeyByScope.set(this._scopeKey, k);
				this._render();
			}
		});
		this._keySelectEl = keySelect;

		this._timelineBarEl = tlBar;

		// Zoom controls slot — always present in the header, outside the
		// timeline-specific bar, so zoom is available for ALL layouts.
		// createTimelineZoom places its .sf-zoom-bar in this host; the scaled
		// body goes into the main body (scaledEl).
		this._zoomSlotEl = head.createDiv({ cls: "sf-ws-zoomslot" });

		this._bodyEl = ce.createDiv({ cls: "sf-ws-body" });

		// aria-live region — announces committed keyboard writes (F8, AC-11).
		const live = ce.createDiv({ cls: "sf-ws-live sf-sr-only" });
		live.setAttribute("aria-live", "polite");
		live.setAttribute("role", "status");
		this._liveEl = live;

		// One InteractionHandler for the whole view (Kanban).
		// Constructed once; destroyed in onClose (CON-4).
		this._closed = false;
		const undo = this._undo;
		this._handler = new InteractionHandler(this.app, ce, {
			onWrite: (file, entries, group): Promise<CommitResult> => this._writeCard(file, entries, group),
			...(undo ? { openGroup: (): JournalGroup => undo.openGroup() } : {}),
			onAfter: (): void => { this._render(); },
			onError: (file, result): void => { if (!result.ok) this._surfaceWriteError(file, result); },
			announce: (msg): void => { this._announce(msg); },
		});
		if (undo) this._registerWithJournal(undo, this._handler);

		// Note index for the Codex tab. Its metadataCache subscriptions go through
		// this view's registerEvent, so unload releases them (CON-4).
		this._noteIndex = createNoteIndex(this.app, (ref) => { this.registerEvent(ref); });

		// One delegated click router on the persistent contentEl (survives body.empty()).
		this.registerDomEvent(ce, "click", (e: MouseEvent) => {
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Right-click on any link (card name, relation pill, editor chip): Obsidian's
		// own file menu. Delegated on the persistent contentEl, released on unload.
		this.registerDomEvent(
			ce,
			"contextmenu",
			linkContextMenuHandler(this.app, ce, (link) => this._resolveLinkFile(link), this.leaf),
		);
		// Keyboard parity: Enter/Space on a focused card or section header.
		// (The InteractionHandler owns Arrow-key moves on bound cards; here we only
		// route the drill/collapse affordances, mirroring _onClick.)
		this.registerDomEvent(ce, "keydown", (e: KeyboardEvent) => {
			if (!isActivationKey(e)) return;
			e.preventDefault();
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Pane drafts (SDD: the editor keeps focus). `input` marks a control as
		// holding uncommitted text, `change` (the commit) clears it, and leaving
		// the pane runs a reconcile that was owed while the draft lived.
		this.registerDomEvent(ce, "input", (e: Event) => { this._onPaneInput(e.target); });
		this.registerDomEvent(ce, "change", (e: Event) => {
			if (e.target === this._draftEl) this._draftEl = null;
		});
		this.registerDomEvent(ce, "focusout", (e: FocusEvent) => { this._onFocusOut(e); });
		// The gesture that a deferred reconcile waits for ends with one of these.
		// Registered after the click router, so the click has acted by then.
		for (const type of ["mouseup", "click", "keyup"]) {
			this.registerDomEvent(ce, type as "click", () => { this._onGestureEnd(); });
		}
		// Click-outside-to-dismiss for the Codex Card selector dropdown (T4.4
		// follow-up). A click that resolves to NO action runs no `_render()`, so
		// an open dropdown would otherwise stay open over whatever the user just
		// clicked. (Until T5.1 the clearest case was a card body, whose inspect
		// was inert; inspect now opens the editor pane and re-renders, leaving
		// clicks on inert chrome as the case this still covers.) Registered
		// document-wide via the same `register*` seam as every other listener
		// here (CON-4): a plain `document.addEventListener` would leak past
		// unload. Runs after `ce`'s click router in the same bubble (document is
		// an ancestor of `ce`), so a pick's own `_render()` has already closed
		// the dropdown by the time this fires — the containment check below is
		// what stops it from fighting the trigger's own open/close toggle.
		this.registerDomEvent(activeDocument, "click", (e: MouseEvent) => {
			this._dismissOpenCardDropdown(e.target);
		});
		// Follow the active note.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			this._paneStale = true;
			this._debouncedRender();
		}));
		// Hybrid reconcile: react to external/self frontmatter changes (ADR-22, ADR-25).
		this.registerEvent(this.app.metadataCache.on("changed", (file: TFile) => {
			if (file.path === this._editor.path) this._paneStale = true;
			this._debouncedRender();
		}));
		// A FileClass changed: the pane's sections and the Cards' tiles may with it.
		// The cache has already coalesced the burst, and `_reconcile` keeps the
		// pane's drafts and owes the render until focus leaves.
		if (this.fileClasses) this.register(this.fileClasses.subscribe(() => { this._reconcile(); }));
		// SDD/Error Handling: a note deleted while the editor is open (T5.4).
		// `metadataCache`'s "deleted" rather than the vault's "delete" because the
		// pane only ever shows a note WITH metadata, and this event hands over a
		// `TFile` where the vault's hands over a `TAbstractFile` to narrow. NOT
		// debounced: the pane is showing a file that no longer exists, so waiting
		// out a debounce window would leave the user editing a ghost.
		this.registerEvent(this.app.metadataCache.on("deleted", (file: TFile) => { this._onNoteDeleted(file); }));
		// A rename moves the note the pane shows to a new path. The store holds a
		// path, so without this the pane would point at nothing.
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this._onRenamed(file, oldPath); }));

		this._syncToggle();
		this._render();
	}

	async onClose(): Promise<void> {
		this._closed = true;
		this._debouncedRender.cancel();
		// Belt-and-suspenders: removeChild unloads the zoom child's listeners even if
		// a re-render didn't run since the last rail render. addChild already ties the
		// child to this view's lifecycle, but explicit removal here is the safe default.
		if (this._zoomChild !== null) {
			this.removeChild(this._zoomChild);
			this._zoomChild = null;
		}
		const handler = this._handler;
		this._handler = null;
		// ADR-52: destroy starts the pending Kanban writes; wait for them (and so for their
		// groups) while the probe and flusher are still registered, then release those.
		handler?.destroy();
		await handler?.flushPending();
		for (const unregister of this._undoRegistrations.splice(0)) unregister();
		this._collapse.clear();
		this._codexSelection.clear();
		this._editor.clear();
		this._inFlight.clear();
		this._inFlightPath = null;
		this._reconcileOwed = false;
		this._cancelDefer();
		this._draftEl = null;
		this._paneStale = false;
		this._noteIndex = null;
		this.contentEl.empty();
	}

	/**
	 * PRD/F2: show `file` **within the Anvil** — its own editor pane — opening,
	 * revealing and re-targeting no other leaf. This is what the `drill` seam
	 * resolves to, from every layout: a Codex card, a Timeline scene, a Plotgrid
	 * row header, a Plotlines entry or a Board card title all land here.
	 *
	 * Public because `main.ts` injects it as the `drill` at the construction
	 * site (T5.1) and because the F2 discharge is a behaviour of the view, not
	 * of a private field.
	 */
	inspect(file: TFile): void {
		this._editor.open(file.path);
		this._render();
	}

	/** Switch the layout and re-render. */
	setLayout(layout: AnvilLayout): void {
		this._layout = layout;
		// A fullscreen pane hides the layout entirely (S100), so a tab click
		// would otherwise change nothing the user can see — the tab strip would
		// be visible but inert, which is exactly the trap keeping it visible is
		// meant to prevent. Leaving fullscreen is a MODE change, not a dock
		// change: the pane stays open in whichever dock is configured (ADR-33).
		this._editor.exitFullscreen();
		this._syncToggle();
		this._render();
	}

	private _syncToggle(): void {
		const modes = this._toggleEl?.querySelectorAll<HTMLElement>("[data-ws-layout]") ?? [];
		modes.forEach((m) => {
			m.classList.toggle("sf-ws-mode--sel", m.getAttribute("data-ws-layout") === this._layout);
		});
		// Timeline sub-controls are only relevant for the Timeline layout.
		this._timelineBarEl?.classList.toggle("sf-ws-tlbar--hidden", this._layout !== "timeline");
		const tlModes = this._timelineBarEl?.querySelectorAll<HTMLElement>("[data-ws-tlmode]") ?? [];
		tlModes.forEach((m) => {
			m.classList.toggle("sf-ws-tlmode-opt--sel", m.getAttribute("data-ws-tlmode") === this._timelineMode);
		});
		// Group-by dropdown reflects the per-scope key; disabled/dimmed in Rail mode.
		const swimKey = this._swimKeyByScope.get(this._scopeKey) ?? "plotline";
		if (this._keySelectEl) {
			this._keySelectEl.value = swimKey;
			const railMode = this._timelineMode === "rail";
			this._keySelectEl.disabled = railMode;
			this._keySelectEl.classList.toggle("sf-ws-tlkey-select--disabled", railMode);
		}
	}

	/**
	 * The **debounced** reconcile — `active-leaf-change` and `metadataCache`
	 * `"changed"` (T5.4). Neither is anything the user asked for right now, so
	 * running one mid-write, and replacing what they just typed with a value the
	 * file has not been given yet, buys nothing. It is *owed* rather than
	 * dropped: `_afterWriteSettled` runs it the moment the last write lands, so
	 * the pane is never left permanently stale either (last-write-wins, ADR-25).
	 *
	 * **User-initiated renders do NOT come through here and must not**: a dock
	 * toggle, fullscreen, close, a collection switch or a section collapse has to
	 * act on the click. A pane that ignores clicks until I/O completes is worse
	 * than one that briefly shows a stale value — and `_renderFields` makes sure
	 * it does not show one either.
	 *
	 * **Scoped to the note the pane is showing**, matching `_shownFrontmatter`.
	 * The defer exists to protect one thing: the optimistic value this pane is
	 * displaying. That is only ever the open note's, so an unresolved write to
	 * some OTHER note buys nothing here and costs the hybrid reconcile — inspect
	 * a second entry while a write to the first is still in flight and, unscoped,
	 * this would suspend every external update to the note now on screen until an
	 * abandoned write to a note nobody is looking at happened to settle. Nothing
	 * clears `_inFlight` on the inspect path (`_onWriteIssued` resets on a path
	 * change only when the user *edits* the new note), and it deliberately should
	 * not: the write really is still in flight, and if the user comes back to
	 * that note before it lands the overlay must still be there. The state stays
	 * honest; the guard narrows the decision.
	 */
	private _reconcile(): void {
		if (this._inFlight.size > 0 && this._inFlightPath === this._editor.path) {
			this._reconcileOwed = true;
			return;
		}
		// The pane is protected while a control in it is focused: a different
		// note's change never concerns it, and a draft must not be destroyed.
		// Either way the reconcile is owed and runs when focus leaves.
		if ((this._paneFocusedField() !== null && !this._paneStale) || this._paneIsDirty()) {
			this._reconcileOwed = true;
			return;
		}
		this._renderKeepingFocus();
	}

	/** The `data-sf-ed-field` cell holding focus, or null when focus is outside the pane's fields. */
	private _paneFocusedField(): HTMLElement | null {
		const active = activeDocument.activeElement;
		if (!(active instanceof HTMLElement) || !this.contentEl.contains(active)) return null;
		return active.closest<HTMLElement>(`[${FIELD_CONTROL_ATTR}]`);
	}

	/** True while the focused control holds text typed since the last commit. */
	private _paneIsDirty(): boolean {
		const draft = this._draftEl;
		return draft !== null && draft.isConnected && draft === activeDocument.activeElement;
	}

	private _onPaneInput(target: EventTarget | null): void {
		if (!(target instanceof HTMLElement)) return;
		if (target.closest(`[${FIELD_CONTROL_ATTR}]`)) this._draftEl = target;
	}

	/** Focus left a control: when it left the pane's fields, run the reconcile owed meanwhile. */
	private _onFocusOut(e: FocusEvent): void {
		if (e.target === this._draftEl) this._draftEl = null;
		const next = e.relatedTarget;
		if (next instanceof HTMLElement && next.closest(`[${FIELD_CONTROL_ATTR}]`)) return;
		if (this._reconcileOwed && next instanceof Node && this.contentEl.contains(next)) {
			this._deferOwedReconcile();
			return;
		}
		this._runOwedReconcile();
	}

	/**
	 * Focus moved to another element of this view: its mousedown (or Tab) is the
	 * start of a gesture, and rebuilding the DOM now would swallow the click.
	 * Wait for the gesture to end (`_onGestureEnd`). The fallback timer is long
	 * on purpose: a press lasts as long as the user holds it, so a short timer
	 * would fire mid-press and lose the click; it only covers a gesture that
	 * never produces an end event, so the owed reconcile is not stranded.
	 */
	private _deferOwedReconcile(): void {
		if (this._deferTimer !== null) return;
		this._deferTimer = window.setTimeout(() => { this._releaseDeferred(); }, DEFER_FALLBACK_MS);
	}

	/**
	 * mouseup, click or keyup: the gesture is over. Run the reconcile in a 0ms
	 * timer rather than inline, because the browser dispatches `click` right
	 * after `mouseup` and the click must see the DOM it was aimed at.
	 */
	private _onGestureEnd(): void {
		if (this._deferTimer === null) return;
		window.clearTimeout(this._deferTimer);
		this._deferTimer = window.setTimeout(() => { this._releaseDeferred(); }, 0);
	}

	private _releaseDeferred(): void {
		this._deferTimer = null;
		this._runOwedReconcile();
	}

	private _cancelDefer(): void {
		if (this._deferTimer === null) return;
		window.clearTimeout(this._deferTimer);
		this._deferTimer = null;
	}

	/** Run the owed reconcile unless a write is unresolved or a draft is still live. */
	private _runOwedReconcile(): void {
		if (!this._reconcileOwed) return;
		if (this._inFlight.size > 0 && this._inFlightPath === this._editor.path) return;
		if (this._paneIsDirty()) return;
		this._reconcileOwed = false;
		this._renderKeepingFocus();
	}

	/** Render, then put the caret back in the field that held focus (by name). */
	private _renderKeepingFocus(): void {
		const name = this._paneFocusedField()?.getAttribute(FIELD_CONTROL_ATTR) ?? null;
		const active = activeDocument.activeElement;
		const start = active instanceof HTMLInputElement ? active.selectionStart : null;
		const end = active instanceof HTMLInputElement ? active.selectionEnd : null;
		this._render();
		if (name === null) return;
		const cells = this.contentEl.querySelectorAll<HTMLElement>(`[${FIELD_CONTROL_ATTR}]`);
		const cell = Array.from(cells).find((c) => c.getAttribute(FIELD_CONTROL_ATTR) === name) ?? null;
		this._focusField(cell);
		// Null on input types with no caret (number, date), which also refuse a range.
		const refocused = activeDocument.activeElement;
		if (start !== null && end !== null && refocused instanceof HTMLInputElement) {
			refocused.setSelectionRange(start, end);
		}
	}

	/** A write is on its way to `path`'s frontmatter; show it until the cache agrees. */
	private _onWriteIssued(path: string, name: string, value: unknown): void {
		if (this._inFlightPath !== path) {
			this._inFlight.clear();
			this._inFlightPath = path;
		}
		this._inFlight.set(name, value);
	}

	/**
	 * The write landed or was refused. Either way it stops being ours to display
	 * — an optimistic value that outlived its write would become a second source
	 * of truth able to shadow an external edit indefinitely.
	 */
	private _afterWriteSettled(name: string): void {
		this._inFlight.delete(name);
		if (this._inFlight.size > 0) return;
		this._runOwedReconcile();
	}

	/**
	 * SDD/Error Handling — "close the pane, return to the grid, notify".
	 *
	 * The path check is what keeps this from being a global listener that closes
	 * the pane whenever anything in the vault is deleted.
	 */
	private _onNoteDeleted(file: TFile): void {
		if (this._editor.path !== file.path) return;
		this._editor.close();
		this._reconcileOwed = false;
		// The note is gone; a value still on its way to it must not be shown as
		// though it were somewhere.
		this._inFlight.clear();
		this._inFlightPath = null;
		new Notice(`"${file.basename}" was deleted. The editor closed.`);
		this._render();
	}

	/**
	 * The open note (or a folder above it) was renamed: follow it. Obsidian
	 * hands over the file already carrying its new path. A folder rename may
	 * arrive as the folder's own event (retarget by prefix) or as each child's
	 * (the exact-path case); handling both keeps this correct either way. The
	 * folder's event can land before its file resolves at the new path, so the
	 * file's own event re-renders, and a folder retarget also schedules a refresh
	 * in case no file event follows.
	 */
	private _onRenamed(file: { readonly path: string }, oldPath: string): void {
		const shown = this._editor.path;
		if (shown === null) return;
		const next = this._pathAfterRename(shown, file, oldPath);
		if (next === null && file.path !== shown) return;
		if (next !== null) {
			this._editor.open(next);
			if (this._inFlightPath === shown) this._inFlightPath = next;
		}
		if (this._paneIsDirty()) {
			// A rebuild would destroy the typed text. The store already follows the
			// note; the render waits for focus to leave. The pane's committer holds
			// the same TFile, which Obsidian renames in place, so a commit meanwhile
			// still lands on the renamed note.
			this._paneStale = true;
			this._reconcileOwed = true;
			return;
		}
		this._renderKeepingFocus();
		if (next !== null && next !== file.path) {
			this._paneStale = true;
			this._debouncedRender();
		}
	}

	/**
	 * Where `shown` now lives, or null when this rename did not move it. The
	 * prefix branch needs no folder check: only a folder can be a path's parent.
	 */
	private _pathAfterRename(shown: string, file: { readonly path: string }, oldPath: string): string | null {
		if (shown === oldPath) return file.path;
		if (shown.startsWith(`${oldPath}/`)) {
			return `${file.path}${shown.slice(oldPath.length)}`;
		}
		return null;
	}

	private _render(): void {
		// A write landing after close (ADR-52) still triggers renders; the view's DOM is gone.
		if (!this._bodyEl || this._closed) return;
		this._paneStale = false;
		// A render IS the reconcile: nothing is owed after it. Cleared at the
		// start because `onNeedsReseed` sets it again while the pane is drawn.
		this._reconcileOwed = false;
		this._cancelDefer();
		this._draftEl = null;
		const body = this._bodyEl;
		body.empty();

		// Tear down prior zoom child (releases DOM listeners, CON-4).
		if (this._zoomChild !== null) {
			this.removeChild(this._zoomChild);
			this._zoomChild = null;
		}
		this._zoomSlotEl?.empty();

		// Where the editor pane goes this cycle — the dock the user set, never
		// anything derived from a width (ADR-33). `null` means no pane is open.
		const paneMode = this._editor.mode(this.getEditorDock());

		// S100: fullscreen takes the layout's space entirely, so no layout body
		// is built and no zoom controls are offered over a body that isn't
		// there. The tab strip lives in the header, OUTSIDE `body`, so it
		// survives this untouched — the Anvil is never a trap.
		//
		// NOTE for T5.3: this returns BEFORE `resolveWorkspaceScope` and
		// `_syncToggle`, so `_scopeKey` is not refreshed while fullscreen.
		// Harmless today (nothing scope-derived is on screen, and `setLayout`
		// leaves fullscreen before switching tabs), but anything that starts
		// reading `_scopeKey` from the pane must move the scope resolution
		// above this branch.
		if (paneMode === "fullscreen") {
			this._renderEditor(body, paneMode);
			return;
		}

		// S99: the pane sits beside a single card column; S92: below the layout.
		// Either way it renders OUTSIDE the zoom-scaled element — the editor is
		// a form, not a zoomable canvas.
		//
		// The **Codex builds its own split** (`renderCodexTab`'s `split` seam),
		// because S99 puts the pill row and the Bases hint full width ABOVE the
		// split with only the grid beside the pane. Wrapping the whole tab body
		// instead wraps four pills onto three rows in a 236px column and clips
		// the Card selector's dropdown against that column's `overflow: auto`.
		// The generic body-level split below therefore serves the other four
		// layouts, none of which any mockup covers — and it has its OWN classes
		// (`sf-ws-split*`), never the Codex's fixed card column. Why they must
		// not share: see `.sf-cx-split-left` in styles.css.
		const codexOwnsSplit = paneMode === "right" && this._layout === "codex";
		let layoutHost = body;
		let paneHost = body;
		if (paneMode === "right" && !codexOwnsSplit) {
			const split = body.createDiv({ cls: "sf-ws-split" });
			layoutHost = split.createDiv({ cls: "sf-ws-split-left" });
			paneHost = split.createDiv({ cls: "sf-ws-split-right" });
		}

		// Fresh child Component owns zoom listeners this render cycle.
		const zoomChild = new Component();
		this.addChild(zoomChild);
		this._zoomChild = zoomChild;
		// Mounting the zoom is deferred to a callback so the Codex can place it
		// INSIDE its own left column (R1): `.sf-zoom-scaled` carries
		// `transform: scale(...)`, and a pane inside it would scale with the
		// grid, scroll inside `.sf-zoom-wrap`, and become the containing block
		// for any absolutely-positioned control a later task adds. Every other
		// layout mounts it exactly where it always did.
		const mountZoom = (host: HTMLElement): HTMLElement =>
			createTimelineZoom(zoomChild, {
				controlsHost: this._zoomSlotEl ?? host,
				scaledHost: host,
			}).scaledEl;

		const f = this.app.workspace.getActiveFile();

		const { scope, scenes } = resolveWorkspaceScope(this.app, f, this.getExcludedFolders());
		this._scopeKey = scope.kind === "none" ? "none" : `${scope.kind}:${scope.ref.path}`;
		this._syncToggle();

		const noScopeHint = (host: HTMLElement): void => {
			if (scope.kind !== "none") return;
			host.createDiv({
				cls: "sf-ws-hint",
				text: "No book/plotline in focus — showing all scenes in the vault.",
			});
		};

		// Codex + dock right: the Codex owns the split (S99), and the zoom is
		// mounted in its left column around the GRID ALONE. Consequence, taken
		// deliberately: in this dock the Codex chrome (pill row, Card selector,
		// Bases hint) and the scope hint sit outside the zoom, where before X1
		// the whole tab scaled. The grid still zooms, and the pane never does.
		// No `noScopeHint` here: `renderCodexTab` empties its container as its
		// first statement, so a hint written before it would be created and
		// destroyed in the same tick. Codex empty-state messaging belongs to
		// `codexTab.ts` (S98's empty state), not here.
		if (codexOwnsSplit) {
			this._renderCodex(body, {
				// The zoom wrapper goes in a host of its own inside the left
				// column, so the wrapper scales the grid and nothing else.
				wrapGridHost: (left: HTMLElement): HTMLElement =>
					mountZoom(left.createDiv({ cls: "sf-ws-zoomhost" })),
				renderPane: (host: HTMLElement): void => { this._renderEditor(host, "right"); },
			});
			return;
		}

		const scaledEl = mountZoom(layoutHost);
		noScopeHint(scaledEl);

		const rows = scenes.map((s) => mapSceneRow(this.app, s));
		const sourcePath = f?.path ?? "";
		const resolve: LinkResolver = (t) => this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);

		switch (this._layout) {
			case "codex":
				this._renderCodex(scaledEl);
				break;
			case "timeline":
				this._renderTimeline(scaledEl, rows);
				break;
			case "kanban":
				this._renderKanban(scaledEl, rows);
				break;
			case "plotgrid": {
				// Plotgrid is read-only: columns = all scope plotlines (persistent);
				// rows = all scenes. No write deps — no app/component/onAfter needed.
				const allPlotlines = resolvePlotlineScope(this.app, this.getExcludedFolders());
				renderPlotgrid(scaledEl, plotgridModelFromScope(rows, allPlotlines, resolve));
				break;
			}
			case "plotlines":
				renderPlotlines(
					scaledEl,
					plotlineModel(rows, resolve),
					{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
					"list",
				);
		}

		// The `codexOwnsSplit` path returned above having drawn its own pane;
		// every other case docks the pane at body level, outside the zoom.
		if (paneMode !== null) this._renderEditor(paneHost, paneMode);
	}

	/**
	 * Draw the open pane into `host` (T5.1 — shell only; fields are T5.2/T5.3).
	 *
	 * The store holds a **path**, so the title is re-resolved every render. A
	 * rename retargets the store first (`_onRenamed`), so the new name shows at
	 * once; a path that still does not resolve (a rename the vault never
	 * announced) degrades to showing the path rather than throwing. Closing the
	 * pane on a deleted note is `_onNoteDeleted`'s.
	 */
	private _renderEditor(host: HTMLElement, mode: EditorPaneMode): void {
		const path = this._editor.path;
		if (path === null) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		const pane = renderEditorPane(host, {
			path,
			title: file instanceof TFile ? file.basename : path,
			mode,
		});
		if (file instanceof TFile) this._renderFields(pane.fieldsEl, file);
	}

	/**
	 * Fill the pane with the note's fields (T5.3): resolve the FileClass chain,
	 * reduce it to a `FieldModel`, and hand that to the renderer — which reads
	 * no FileClass of its own (ADR-31).
	 *
	 * Every dock renders through here, so "the docks differ only in room"
	 * (PRD/F5) holds by construction rather than by three call sites agreeing.
	 * A note with no FileClass at all still renders: `buildFieldModel` falls
	 * back to the keys the note actually has.
	 *
	 * The controls report their edits to a `FieldCommitter` built here (T5.4),
	 * which is the pane's only write path and goes through `frontmatterWriter`
	 * (CON-1). It is per-render on purpose: it snapshots what the file held when
	 * the pane was drawn, and that snapshot is what a failed write rolls back to.
	 */
	private _renderFields(fieldsEl: HTMLElement, file: TFile): void {
		const source = this.fileClasses;
		const frontmatter = this._shownFrontmatter(file);
		const startName = source?.nameFor(file);
		const chain = source && startName !== undefined ? resolveFileClassChain(startName, source.lookup) : [];
		const model = buildFieldModel(chain, frontmatter, GENERATED_UI_HINTS);
		const valueOf = (name: string): unknown => frontmatter[name] ?? null;

		const media = createMediaSeams(this.app, file);
		const commits = new FieldCommitter({
			app: this.app,
			media,
			file,
			model,
			host: fieldsEl,
			valueOf,
			onWriteIssued: (name, value): void => { this._onWriteIssued(file.path, name, value); },
			onWriteSettled: (name): void => { this._afterWriteSettled(name); },
			onNeedsReseed: (): void => { this._reconcileOwed = true; },
		});

		renderFieldSections(fieldsEl, model, { valueOf, onEdit: commits.onEdit, media });
	}

	/**
	 * The note's frontmatter **as the pane must show it**: what `metadataCache`
	 * holds, plus any write already issued for this note that has not landed yet.
	 *
	 * `_reconcile` defers only the two debounced paths. Every other render is
	 * user-initiated and stays immediate (ruled) — and a click is exactly what
	 * produces the race, because its mousedown blurs the box, which fires the
	 * `change` that starts the commit, and the click handler then renders in the
	 * same tick. Rebuilt from `metadataCache` alone, the controls would show the
	 * pre-edit value and the user would watch their own edit revert, with no undo
	 * journal to get it back (#17). So the render is corrected, not delayed.
	 *
	 * The overlay cannot go stale: an entry lives only while its write is
	 * unresolved (`_afterWriteSettled` drops it either way), so it can never
	 * shadow a later external edit.
	 */
	private _shownFrontmatter(file: TFile): Record<string, unknown> {
		const cached = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		if (this._inFlightPath !== file.path || this._inFlight.size === 0) return cached;
		return { ...cached, ...Object.fromEntries(this._inFlight) };
	}

	/**
	 * Codex layout: collection pills over the entry grid (T4.1, S91). The body
	 * is shared with the Workbench; everything host-specific stays here — the
	 * note index, the selection store and the click enactment.
	 */
	private _renderCodex(body: HTMLElement, split?: CodexTabSplit): void {
		const collections = this.getCollections();
		const active = this._codexSelection.resolve(collections);
		const frontmatterFor = (path: string): Record<string, unknown> | null => {
			const file = this._noteIndex?.fileFor(path) ?? null;
			if (!file) return null;
			return this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
		};
		renderCodexTab(body, {
			// S92/S99 draw the open entry as a selected card; the grid is the
			// only place that cue can live (T5.1).
			...(this._editor.path !== null ? { openPath: this._editor.path } : {}),
			// S99: the pane goes inside the Codex's own split, beside the grid
			// and below the pill row — see the `split` seam's doc comment.
			...(split ? { split } : {}),
			collections,
			selection: this._codexSelection,
			index: this._noteIndex?.notes() ?? [],
			excludedFolders: this.getExcludedFolders(),
			frontmatterFor,
			resolveAsset: (sourcePath, raw): string => createLinkedImageResolver(this.app, sourcePath)(raw),
			tileField: createCardTileField(this.fileClasses, (path) => this._noteIndex?.fileFor(path) ?? null),
			cardId: active ? this.getCardByCollection()[active.id] : undefined,
			basesCapability: this.getBasesCapability(),
			dismissedHints: this.getDismissedHints(),
		});
	}

	/** Timeline layout: rail or swimlane grid (read-only). `body` is `scaledEl`. */
	private _renderTimeline(body: HTMLElement, rows: SceneRow[]): void {
		if (this._timelineMode === "swimlane") {
			const key = this._swimKeyByScope.get(this._scopeKey) ?? "plotline";
			const resolve: LinkResolver = (t) =>
				this.app.metadataCache.getFirstLinkpathDest(t, "");
			renderTimeline(
				body,
				[],
				{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
				"swimlane",
				{ swimlane: swimlaneGrid(rows, key, resolve) },
			);
			return;
		}

		// Rail: render into the zoom-scaled element (zoom already created in _render).
		renderTimeline(
			body,
			timelineModel(rows),
			{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
			"rail",
		);
	}

	/** Kanban layout: status columns with drag→status+order write-back (F1). */
	private _renderKanban(body: HTMLElement, rows: SceneRow[]): void {
		if (!this._handler) return;
		renderKanban(
			body,
			kanbanModel(rows, STATUS_VOCAB),
			{
				app: this.app,
				renumber: async (writes: RenumberWrite[], group: JournalGroup | null): Promise<void> => {
					for (const w of writes) {
						await commit(this.app, w.file, "order", w.order, ORDER_FIELD, groupOption(group));
					}
				},
			},
			this._handler,
		);
	}

	/** The Kanban handler's write for one card, in the gesture's group when there is one. */
	private _writeCard(file: TFile, entries: CommitEntry[], group: JournalGroup | null): Promise<CommitResult> {
		const options = groupOption(group);
		const [only] = entries;
		if (entries.length > 1 || only === undefined) return commitMany(this.app, file, entries, options);
		return commit(this.app, file, only.key, only.value, only.field, options);
	}

	// --- Undo: pending work (spec 009, ADR-39) ------------------------------

	/** Register the view's probe, the Kanban handler's probe and its flusher; released in onClose. */
	private _registerWithJournal(undo: UndoJournal, handler: InteractionHandler): void {
		this._undoRegistrations.push(
			undo.registerProbe((path) => this._pendingIn(path)),
			undo.registerProbe((path) => (handler.isBusy(path) ? "write" : null)),
			undo.registerFlusher(() => handler.flushPending()),
		);
	}

	/**
	 * `draft` while the editor pane shows `path` and a control holds text not yet committed;
	 * `write` while a pane write to `path` has not landed.
	 */
	private _pendingIn(path: string): PendingReason | null {
		if (this._draftEl?.isConnected === true && this._editor.path === path) return "draft";
		if (this._inFlightPath === path && this._inFlight.size > 0) return "write";
		return null;
	}

	// --- Write-error surface (ADR-24) ---------------------------------------

	/**
	 * Mark the offending card with an error class + fire a transient Notice. After close only
	 * the Notice: the view's DOM is gone, but a failed write must not be silent.
	 */
	private _surfaceWriteError(file: TFile, result: CommitError): void {
		if (!this._closed) this._findCardEl(file.path)?.classList.add("sf-card--error");
		new Notice(result.message);
	}

	/**
	 * Locate the interactive element representing `path` (Kanban card, Timeline
	 * rail item) so the error surface can mark it. Uses a manual attribute scan
	 * (no CSS.escape needed — jsdom-safe, path may contain quotes/brackets).
	 */
	private _findCardEl(path: string): HTMLElement | null {
		const body = this._bodyEl;
		if (!body) return null;
		const candidates = body.querySelectorAll<HTMLElement>(
			".sf-kb-card[data-sf-card-path], .sf-tl-item[data-sf-item-path]",
		);
		for (const el of Array.from(candidates)) {
			if (
				el.getAttribute("data-sf-card-path") === path ||
				el.getAttribute("data-sf-item-path") === path
			) {
				return el;
			}
		}
		return null;
	}

	/** Write a message into the aria-live region (F8, AC-11). */
	private _announce(msg: string): void {
		if (this._liveEl && !this._closed) this._liveEl.textContent = msg;
	}

	/**
	 * ADR-28 / T2.5: classify the marker kind a single DOM node carries, if any.
	 * data-sf-link is "name"; data-ws-layout, data-ws-tlmode, the Codex
	 * collection pill, the Codex Card selector option (T4.4) and
	 * data-sf-section-toggle are all "structuralControl" (the Anvil's tab strip /
	 * timeline sub-mode toggle / collection switcher / Card switcher /
	 * collapsible section headers). Card and pane titles carry a title marker
	 * beside `data-sf-link`; the order in `ANVIL_MARKERS` decides those.
	 *
	 * T4.1 adds the Codex card body — the FIRST producer of "cardBody" in the
	 * plugin; until now the kind was resolved and unit-tested in
	 * `navigationController.ts` while no surface emitted it. It is a separate
	 * element from the name it contains (never the same node), so the
	 * name-over-card-body precedence AC falls out of the nearest-first walk
	 * with no ranking anywhere — see `codexTab.ts`.
	 *
	 * T4.6 adds two more structural controls: the S98 empty state's "Change
	 * tag" action and the ADR-36 Bases hint's dismiss button. Neither
	 * navigates and neither nests a name, so — like the Card selector option —
	 * they need only a presence check here; `_operateControl` reads the
	 * marker's value to know WHICH collection/hint it targets.
	 *
	 * The vocabulary and this exact check order now live in
	 * `navigation/markerVocabulary.ts` (`ANVIL_MARKERS`) — factored out once
	 * `SidebarView` needed the identical attribute→kind mapping under a
	 * different whitelist. Order is preserved verbatim; see that module's
	 * docstring for why reordering would be a behaviour change.
	 */
	private readonly _markerKindOf: MarkerKindOf = createMarkerKindOf(ANVIL_MARKERS);

	/**
	 * Resolve `nearest`'s target path to a `TFile`. A name carries it in
	 * `data-sf-link`, a Codex card body in `data-sf-card-body` — one attribute
	 * per element, so which one is present says nothing about precedence (the
	 * walk already settled that); both name the same kind of thing.
	 */
	private _resolveLinkFile(nearest: HTMLElement | null): TFile | null {
		const path =
			nearest?.getAttribute("data-sf-link") ?? nearest?.getAttribute(CODEX_CARD_BODY_ATTR);
		if (!path) return null;
		const file =
			this.app.vault.getAbstractFileByPath(path) ??
			this.app.metadataCache.getFirstLinkpathDest(path, this._linkSourcePath(nearest));
		return file instanceof TFile ? file : null;
	}

	/** The note a link sits in, so a name shared by two notes resolves as Obsidian would. */
	private _linkSourcePath(link: HTMLElement | null): string {
		const card = link?.closest(`[${CODEX_CARD_BODY_ATTR}]`)?.getAttribute(CODEX_CARD_BODY_ATTR);
		return card ?? link?.closest(`[${EDITOR_PATH_ATTR}]`)?.getAttribute(EDITOR_PATH_ATTR) ?? "";
	}

	/**
	 * Enact an "operateControl" outcome: `nearest` carries exactly one of the
	 * structural markers `_markerKindOf` recognises — determine which and
	 * run the same handling `_onClick` used to run inline.
	 */
	private _operateControl(nearest: HTMLElement | null): void {
		if (!nearest) return;

		const layout = nearest.getAttribute("data-ws-layout");
		if (layout !== null) {
			if (isAnvilTab(layout)) this.setLayout(layout);
			return;
		}

		const collectionId = nearest.getAttribute(CODEX_COLLECTION_ATTR);
		if (collectionId !== null) {
			this._codexSelection.select(collectionId);
			// PRD/F3: the pane must never survive into a collection it does not
			// belong to. The entry it shows has no counterpart in the new
			// collection to retarget to, so switching closes it. This was
			// vacuously true while `_render` emptied the body wholesale; pane
			// state is what makes it a real obligation (see T5.1).
			this._editor.close();
			this._render();
			return;
		}

		// T4.4: a Card option in the selector dropdown. Persist against the
		// COLLECTION THAT IS ACTIVE RIGHT NOW — not a fixed key — so the choice
		// is remembered per collection (PRD/F4 AC), then re-render so the grid
		// picks it up immediately. Never touches frontmatter (CON-2/CON-1).
		const cardId = nearest.getAttribute(CODEX_CARD_SELECT_ATTR);
		if (cardId !== null) {
			const active = this._codexSelection.resolve(this.getCollections());
			if (active) {
				this.onCardSelect(active.id, cardId);
				this._render();
			}
			return;
		}

		const tlMode = nearest.getAttribute("data-ws-tlmode");
		if (tlMode === "rail" || tlMode === "swimlane") {
			this._timelineMode = tlMode;
			this._syncToggle();
			this._render();
			return;
		}

		// T4.6, S98 "Change tag": opens Settings. No re-render — nothing in the
		// grid changed yet, unlike a card pick or a hint dismissal.
		const changeTagCollectionId = nearest.getAttribute(CODEX_CHANGE_TAG_ATTR);
		if (changeTagCollectionId !== null) {
			this.onChangeTag(changeTagCollectionId);
			return;
		}

		// T4.6, ADR-36: dismissing the Bases hint persists the id (host-injected
		// onDismissHint), then re-renders so the hint disappears immediately —
		// same "persist, then re-render" shape as onCardSelect above.
		const dismissedHintId = nearest.getAttribute(CODEX_HINT_DISMISS_ATTR);
		if (dismissedHintId !== null) {
			this.onDismissHint(dismissedHintId);
			this._render();
			return;
		}

		// T5.1: an editor pane header tool (S92/S99/S100).
		const editorTool = nearest.getAttribute(EDITOR_TOOL_ATTR);
		if (editorTool !== null) {
			this._operateEditorTool(editorTool);
			return;
		}

		if (nearest.hasAttribute("data-sf-section-toggle")) {
			const key = nearest.getAttribute("data-sf-group-key");
			if (key) {
				this._collapse.toggle("main", this._scopeKey, key);
				this._render();
			}
		}
	}

	/**
	 * Enact a `focusField` outcome (T5.2): put the caret in the control the
	 * click landed on.
	 *
	 * A click directly on an `<input>` focuses it in a browser anyway; this
	 * exists for the rest of the cell — the padding around the box, and the
	 * chip row's empty space — so the whole control behaves as one target
	 * rather than a live box surrounded by dead pixels. It focuses nothing else
	 * and opens nothing: an editable field is the one target kind in the F2
	 * matrix that must never navigate.
	 */
	private _focusField(nearest: HTMLElement | null): void {
		if (!nearest) return;
		// The fallback is the CELL, and it is real: `fieldControls` gives every
		// cell `tabindex="-1"`, so `focus()` on it does something. Before that it
		// focused a plain <div> and a chip-only cell (a `File` holding its one
		// link, which renders no input at all) was dead pixels.
		//
		// Deliberately NOT `[role="button"]` as well: that would land focus on a
		// chip's remove affordance, putting a destructive action under Enter for
		// anyone who merely clicked the cell. Two overlapping mechanisms would
		// also mean one of them never being exercised.
		const control = nearest.querySelector<HTMLElement>("input, select, textarea");
		(control ?? nearest).focus();
	}

	/**
	 * Enact one of the pane's four header tools (T5.1). `raw` comes straight
	 * off a DOM attribute, so it is narrowed before use (CON-8) — an attribute
	 * carrying anything else is ignored rather than trusted.
	 *
	 * `dock` is the only branch that touches the dock, and it always goes
	 * through the host's persistence callback (ADR-33): the pane never keeps a
	 * dock of its own, so a change made here is the same change the next reload
	 * sees.
	 */
	private _operateEditorTool(raw: string): void {
		if (!isEditorTool(raw)) return;
		switch (raw) {
			case "close":
				this._editor.close();
				break;
			case "fullscreen":
				this._editor.toggleFullscreen();
				break;
			case "back":
				this._editor.exitFullscreen();
				break;
			case "dock":
				this.onEditorDockChange(this.getEditorDock() === "bottom" ? "right" : "bottom");
				break;
		}
		this._render();
	}

	/**
	 * Close the Codex Card selector's dropdown if it is open and `clickTarget`
	 * landed outside it (T4.4 follow-up). A no-op when nothing is open, when
	 * the Codex tab isn't the active layout, or when the click landed inside
	 * `.sf-cx-cardsel` itself — the trigger's own toggle and a pick's own
	 * `_render()` already handle those cases correctly on their own.
	 */
	private _dismissOpenCardDropdown(clickTarget: EventTarget | null): void {
		const dd = this._bodyEl?.querySelector<HTMLElement>(".sf-cx-cardsel-dd:not([hidden])");
		if (!dd) return;

		const wrap = dd.closest(".sf-cx-cardsel");
		if (wrap && clickTarget instanceof Node && wrap.contains(clickTarget)) return;

		dd.hidden = true;
		wrap?.querySelector<HTMLElement>(".sf-cx-cardsel-trigger")?.setAttribute("aria-expanded", "false");
	}

	/**
	 * ADR-28: classify-then-act via the shared `NavigationController`. Both
	 * bespoke per-attribute click paths are gone — every click is classified
	 * from its nearest-first marker chain, and the resolved action decides what
	 * happens. "inspect" targets the Anvil's own body (`_drill`, T2.5's fix for
	 * the reported regression — never `revealAndShowFile`); "openNote" and
	 * "operateControl" are enacted here because they need the specific file /
	 * control identity the controller never sees.
	 */
	private _onClick(target: EventTarget | null, modifier: boolean): void {
		if (!(target instanceof HTMLElement)) return;

		const { markers, nearest } = walkTargetMarkers(target, this.contentEl, (el) => this._markerKindOf(el));

		const controller = createNavigationController({
			getLinkClickAction: this.getLinkClickAction,
			getCardTitleOpensNote: this.getCardTitleOpensNote,
			inspect: (): void => {
				const file = this._resolveLinkFile(nearest);
				if (file) this._drill(file);
			},
		});
		const outcome = controller.handle(markers, modifier);

		switch (outcome.action) {
			case "openNote": {
				const file = this._resolveLinkFile(nearest);
				if (file) void this.app.workspace.openLinkText(file.path, "", false);
				break;
			}
			case "openNoteInTab": {
				const file = this._resolveLinkFile(nearest);
				if (file) void this.app.workspace.openLinkText(file.path, "", true);
				break;
			}
			case "operateControl":
				this._operateControl(nearest);
				break;
			case "inspect":
				// Already invoked via deps.inspect inside controller.handle().
				break;
			case "focusField":
				this._focusField(nearest);
				break;
			case "none":
				break;
		}
	}
}
