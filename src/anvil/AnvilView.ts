/**
 * AnvilView — the main-area workspace host (M5 read views + M6 interactive views).
 *
 * One polymorphic `ItemView` (ADR-16) with a header toolbar. It follows the active
 * note (active-leaf-change), resolves scope via the shared core, maps rows, and routes
 * to one of five layouts (tab strip built by `anvilTabs.ts`, S91/S94):
 *
 *   codex     — collection grid + editor pane (T2.2: placeholder empty state; the real
 *               grid is Phase 4)
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
import { DEBOUNCE_MS, WORKSPACE_VIEW_TYPE } from "pluginConstants";
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
import { commit, commitMany, type CommitResult, type CommitError } from "../inspector/frontmatterWriter";
import { CollapseStore } from "workspace/collapseStore";
import { ANVIL_TAB_LABEL, buildAnvilTabStrip, isAnvilTab } from "./anvilTabs";
import { createNavigationController, type TargetKind } from "navigation/navigationController";
import { walkTargetMarkers } from "navigation/domTargetWalk";

export type AnvilLayout = "codex" | "timeline" | "plotlines" | "kanban" | "plotgrid";

/** The Timeline sub-mode toggle (ADR-16 / mockup S62 vs S76). */
type TimelineMode = "rail" | "swimlane";

/** The status vocabulary that seeds the Kanban columns (mirrors schema/scene.json). */
const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

/** The `order` field spec used by the Kanban renumber path. */
const ORDER_FIELD = { name: "order", type: "number" as const };

export interface AnvilViewOpts {
	/** Reads the live link-click setting (getter — main.ts reassigns settings). */
	getLinkClickAction?: () => "drill" | "open";
	/** Drill seam — injected for testability; defaults to the sidebar Context drill. */
	drill?: (file: TFile) => void;
	/**
	 * Reads the live excludedFolders setting (T3.5), threaded into resolveWorkspaceScope
	 * and resolvePlotlineScope. Getter (not a captured value) for the same reason as
	 * getLinkClickAction — main.ts reassigns settings on load. Defaults to
	 * DEFAULT_EXCLUDED_FOLDERS so existing construction sites are unaffected.
	 */
	getExcludedFolders?: () => readonly string[];
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
	private _scopeKey = "none";
	private _bodyEl: HTMLElement | null = null;
	private _toggleEl: HTMLElement | null = null;
	private _timelineBarEl: HTMLElement | null = null;
	private _keySelectEl: HTMLSelectElement | null = null;
	private _zoomSlotEl: HTMLElement | null = null;
	private _liveEl: HTMLElement | null = null;
	private _handler: InteractionHandler | null = null;
	/** Child Component owning the current zoom listeners. Replaced on every rail render. */
	private _zoomChild: Component | null = null;
	private readonly getLinkClickAction: () => "drill" | "open";
	private readonly _drill: (file: TFile) => void;
	private readonly getExcludedFolders: () => readonly string[];
	private readonly _debouncedRender: ReturnType<typeof debounce<[], void>>;

	constructor(leaf: WorkspaceLeaf, opts?: AnvilViewOpts) {
		super(leaf);
		this.getLinkClickAction = opts?.getLinkClickAction ?? ((): "drill" => "drill");
		// ADR-28: this is the Anvil's "inspect" implementation. It used to default to
		// revealAndShowFile(app, file), which opened/revealed the Workbench leaf — the
		// reported regression (a click in the Anvil must target no other leaf). The
		// Anvil has nowhere to show an inspection until its own editor pane lands in
		// Phase 4/5, so the default deliberately does nothing; tests inject `drill`
		// to observe inspection through the seam that exists for exactly this purpose.
		this._drill = opts?.drill ?? ((): void => {});
		this.getExcludedFolders = opts?.getExcludedFolders ?? ((): readonly string[] => DEFAULT_EXCLUDED_FOLDERS);
		this._debouncedRender = debounce((): void => { this._render(); }, DEBOUNCE_MS, true);
	}

	getViewType(): string {
		return WORKSPACE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return `Anvil — ${ANVIL_TAB_LABEL[this._layout]}`;
	}

	getIcon(): string {
		switch (this._layout) {
			case "codex": return "library";
			case "plotlines": return "git-branch";
			case "kanban": return "columns";
			case "plotgrid": return "grid";
			default: return "clock";
		}
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
		// body goes into the main body (zoom.scaledEl).
		this._zoomSlotEl = head.createDiv({ cls: "sf-ws-zoomslot" });

		this._bodyEl = ce.createDiv({ cls: "sf-ws-body" });

		// aria-live region — announces committed keyboard writes (F8, AC-11).
		const live = ce.createDiv({ cls: "sf-ws-live sf-sr-only" });
		live.setAttribute("aria-live", "polite");
		live.setAttribute("role", "status");
		this._liveEl = live;

		// One InteractionHandler for the whole view (Kanban).
		// Constructed once; destroyed in onClose (CON-4).
		this._handler = new InteractionHandler(this.app, ce, {
			onWrite: (file, entries): Promise<CommitResult> =>
				entries.length > 1
					? commitMany(this.app, file, entries)
					: commit(this.app, file, entries[0]!.key, entries[0]!.value, entries[0]!.field),
			onAfter: (): void => { this._render(); },
			onError: (file, result): void => { if (!result.ok) this._surfaceWriteError(file, result); },
			announce: (msg): void => { this._announce(msg); },
		});

		// One delegated click router on the persistent contentEl (survives body.empty()).
		this.registerDomEvent(ce, "click", (e: MouseEvent) => {
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Keyboard parity: Enter/Space on a focused card or section header.
		// (The InteractionHandler owns Arrow-key moves on bound cards; here we only
		// route the drill/collapse affordances, mirroring _onClick.)
		this.registerDomEvent(ce, "keydown", (e: KeyboardEvent) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Follow the active note.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => { this._debouncedRender(); }));
		// Hybrid reconcile: react to external/self frontmatter changes (ADR-22, ADR-25).
		this.registerEvent(this.app.metadataCache.on("changed", () => { this._debouncedRender(); }));

		this._syncToggle();
		this._render();
	}

	async onClose(): Promise<void> {
		this._debouncedRender.cancel();
		// Belt-and-suspenders: removeChild unloads the zoom child's listeners even if
		// a re-render didn't run since the last rail render. addChild already ties the
		// child to this view's lifecycle, but explicit removal here is the safe default.
		if (this._zoomChild !== null) {
			this.removeChild(this._zoomChild);
			this._zoomChild = null;
		}
		this._handler?.destroy();
		this._handler = null;
		this._collapse.clear();
		this.contentEl.empty();
	}

	/** Switch the layout and re-render. */
	setLayout(layout: AnvilLayout): void {
		this._layout = layout;
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

	private _render(): void {
		if (!this._bodyEl) return;
		const body = this._bodyEl;
		body.empty();

		// Tear down prior zoom child (releases DOM listeners, CON-4).
		if (this._zoomChild !== null) {
			this.removeChild(this._zoomChild);
			this._zoomChild = null;
		}
		this._zoomSlotEl?.empty();
		// Fresh child Component owns zoom listeners this render cycle.
		const zoomChild = new Component();
		this.addChild(zoomChild);
		this._zoomChild = zoomChild;
		const zoom = createTimelineZoom(zoomChild, {
			controlsHost: this._zoomSlotEl ?? body,
			scaledHost: body,
		});

		const f = this.app.workspace.getActiveFile();

		const { scope, scenes } = resolveWorkspaceScope(this.app, f, this.getExcludedFolders());
		this._scopeKey = scope.kind === "none" ? "none" : `${scope.kind}:${scope.ref.path}`;
		this._syncToggle();

		if (scope.kind === "none") {
			zoom.scaledEl.createDiv({
				cls: "sf-ws-hint",
				text: "No book/plotline in focus — showing all scenes in the vault.",
			});
		}

		const rows = scenes.map((s) => mapSceneRow(this.app, s));
		const sourcePath = f?.path ?? "";
		const resolve: LinkResolver = (t) => this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);

		switch (this._layout) {
			case "codex":
				// Placeholder empty state (T2.2). The real Codex collection grid + editor
				// pane is Phase 4 (F3/F5) — this tab exists so the strip is complete and
				// the layout union/persistence path are exercised now.
				zoom.scaledEl.createDiv({
					cls: "sf-cx-placeholder",
					text: "Codex is coming soon.",
				});
				break;
			case "timeline":
				this._renderTimeline(zoom.scaledEl, rows);
				break;
			case "kanban":
				this._renderKanban(zoom.scaledEl, rows);
				break;
			case "plotgrid": {
				// Plotgrid is read-only: columns = all scope plotlines (persistent);
				// rows = all scenes. No write deps — no app/component/onAfter needed.
				const allPlotlines = resolvePlotlineScope(this.app, this.getExcludedFolders());
				renderPlotgrid(zoom.scaledEl, plotgridModelFromScope(rows, allPlotlines, resolve));
				break;
			}
			case "plotlines":
				renderPlotlines(
					zoom.scaledEl,
					plotlineModel(rows, resolve),
					{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
					"list",
				);
		}
	}

	/** Timeline layout: rail or swimlane grid (read-only). `body` is `zoom.scaledEl`. */
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
				renumber: async (writes: RenumberWrite[]): Promise<void> => {
					for (const w of writes) {
						await commit(this.app, w.file, "order", w.order, ORDER_FIELD);
					}
				},
			},
			this._handler,
		);
	}

	// --- Write-error surface (ADR-24) ---------------------------------------

	/** Mark the offending card with an error class + fire a transient Notice. */
	private _surfaceWriteError(file: TFile, result: CommitError): void {
		const card = this._findCardEl(file.path);
		card?.classList.add("sf-card--error");
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
		if (this._liveEl) this._liveEl.textContent = msg;
	}

	/**
	 * ADR-28 / T2.5: classify the marker kind a single DOM node carries, if any.
	 * Exactly the four attributes `_onClick` used to check via independent
	 * `closest()` calls — data-sf-link ("name"); data-ws-layout, data-ws-tlmode
	 * and data-sf-section-toggle (all "structuralControl", the Anvil's tab
	 * strip / timeline sub-mode toggle / collapsible section headers). None of
	 * these ever co-occur on the same node in the current markup.
	 */
	private _markerKindOf(el: HTMLElement): TargetKind | null {
		if (el.hasAttribute("data-sf-link")) return "name";
		if (el.hasAttribute("data-ws-layout")) return "structuralControl";
		if (el.hasAttribute("data-ws-tlmode")) return "structuralControl";
		if (el.hasAttribute("data-sf-section-toggle")) return "structuralControl";
		return null;
	}

	/** Resolve `nearest`'s `data-sf-link` (if any) to a `TFile`, mirroring the old lookup. */
	private _resolveLinkFile(nearest: HTMLElement | null): TFile | null {
		const path = nearest?.getAttribute("data-sf-link");
		if (!path) return null;
		const file =
			this.app.vault.getAbstractFileByPath(path) ??
			this.app.metadataCache.getFirstLinkpathDest(path, "");
		return file instanceof TFile ? file : null;
	}

	/**
	 * Enact an "operateControl" outcome: `nearest` carries exactly one of the
	 * three structural markers `_markerKindOf` recognises — determine which and
	 * run the same handling `_onClick` used to run inline.
	 */
	private _operateControl(nearest: HTMLElement | null): void {
		if (!nearest) return;

		const layout = nearest.getAttribute("data-ws-layout");
		if (layout !== null) {
			if (isAnvilTab(layout)) this.setLayout(layout);
			return;
		}

		const tlMode = nearest.getAttribute("data-ws-tlmode");
		if (tlMode === "rail" || tlMode === "swimlane") {
			this._timelineMode = tlMode;
			this._syncToggle();
			this._render();
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
}
