/**
 * WorkspaceView — the main-area workspace host (M5 read views + M6 interactive views).
 *
 * One polymorphic `ItemView` (ADR-16) with a header toolbar. It follows the active
 * note (active-leaf-change), resolves scope via the shared core, maps rows, and routes
 * to one of five layouts:
 *
 *   timeline  — rail OR swimlane (read; M6 adds swimlane + zoom + placement drag)
 *   plotlines — Plotlines list (read, M5)
 *   kanban    — status columns, drag→status+order write-back (M6)
 *   plotgrid  — plotline × scene matrix, click-toggle plotlines write-back (M6)
 *   locations — nested world/location tree (read, M6)
 *
 * The view OWNS one `InteractionHandler` (constructed in onOpen, destroyed in onClose —
 * CON-4) shared by the Kanban board and the Timeline-placement rail; the Plotgrid uses a
 * click-toggle (not the drag machine). A write:
 *   - is committed via the single seam (`commit` / `commitMany`),
 *   - optimistically re-renders (`onAfter`),
 *   - on failure marks the card + fires a `Notice` (ADR-24),
 *   - announces into an `aria-live=polite` region on the keyboard path (F8).
 *
 * A debounced `metadataCache.changed` subscription reconciles this view and refreshes any
 * other open WorkspaceView on the same scope (hybrid re-render, ADR-22; last-write-wins,
 * ADR-25).
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-2, ADR-3, ADR-13
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-16, ADR-20, ADR-21, ADR-22, ADR-24, ADR-25
 */

import { ItemView, Notice, TFile, debounce, type WorkspaceLeaf } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import { revealAndShowFile } from "views/SidebarView";
import { resolveWorkspaceScope, resolveLocationScope } from "scoping/workspaceScope";
import { mapSceneRow, mapLocationRow } from "workspace/sceneMapper";
import {
	timelineModel,
	plotlineModel,
	kanbanModel,
	plotgridModel,
	swimlaneModel,
	locationTreeModel,
	snapStoryDay,
	type LinkResolver,
	type SwimlaneKey,
	type SceneRow,
} from "workspace/workspaceModel";
import { renderTimeline } from "workspace/renderTimeline";
import { renderPlotlines } from "workspace/renderPlotlines";
import { renderKanban, type RenumberWrite } from "workspace/renderKanban";
import { renderPlotgrid } from "workspace/renderPlotgrid";
import { renderLocationsTree } from "workspace/renderLocationsTree";
import { createTimelineZoom } from "workspace/timelineZoom";
import { InteractionHandler, type Draggable, type CommitEntry } from "workspace/interactionHandler";
import { commit, commitMany, type CommitResult } from "../inspector/frontmatterWriter";
import { CollapseStore } from "workspace/collapseStore";

export const WORKSPACE_VIEW_TYPE = "story-forge-workspace";

export type WorkspaceLayout = "timeline" | "plotlines" | "kanban" | "plotgrid" | "locations";

/** The Timeline sub-mode toggle (ADR-16 / mockup S62 vs S76). */
type TimelineMode = "rail" | "swimlane";

/** The status vocabulary that seeds the Kanban columns (mirrors schema/scene.json). */
const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

/** The `order` field spec used by the Kanban renumber path. */
const ORDER_FIELD = { name: "order", type: "number" as const };

/** The `storyDay` field spec used by the Timeline-placement drag. */
const STORY_DAY_FIELD = { name: "storyDay", type: "number" as const };

export interface WorkspaceViewOpts {
	/** Reads the live link-click setting (getter — main.ts reassigns settings). */
	getLinkClickAction?: () => "drill" | "open";
	/** Drill seam — injected for testability; defaults to the sidebar Context drill. */
	drill?: (file: TFile) => void;
}

function isLayout(v: unknown): v is WorkspaceLayout {
	return (
		v === "timeline" ||
		v === "plotlines" ||
		v === "kanban" ||
		v === "plotgrid" ||
		v === "locations"
	);
}

function isSwimlaneKey(v: unknown): v is SwimlaneKey {
	return v === "pov" || v === "location" || v === "plotline";
}

/** Human labels for the five layout modes (sentence-case UI). */
const LAYOUT_LABEL: Record<WorkspaceLayout, string> = {
	timeline: "Timeline",
	plotlines: "Plotlines",
	kanban: "Kanban",
	plotgrid: "Plotgrid",
	locations: "Locations",
};

export class WorkspaceView extends ItemView {
	private _layout: WorkspaceLayout = "timeline";
	private _timelineMode: TimelineMode = "rail";
	/** Swimlane grouping key, persisted per-scope (ADR-20). */
	private readonly _swimKeyByScope = new Map<string, SwimlaneKey>();
	private readonly _collapse = new CollapseStore();
	private _scopeKey = "none";
	private _bodyEl: HTMLElement | null = null;
	private _toggleEl: HTMLElement | null = null;
	private _timelineBarEl: HTMLElement | null = null;
	private _liveEl: HTMLElement | null = null;
	private _handler: InteractionHandler | null = null;
	private readonly getLinkClickAction: () => "drill" | "open";
	private readonly _drill: (file: TFile) => void;
	private readonly _debouncedRender: ReturnType<typeof debounce<[], void>>;

	constructor(leaf: WorkspaceLeaf, opts?: WorkspaceViewOpts) {
		super(leaf);
		this.getLinkClickAction = opts?.getLinkClickAction ?? ((): "drill" => "drill");
		this._drill =
			opts?.drill ?? ((file: TFile): void => { void revealAndShowFile(this.app, file); });
		this._debouncedRender = debounce((): void => { this._render(); }, DEBOUNCE_MS, true);
	}

	getViewType(): string {
		return WORKSPACE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return `Story Forge ${LAYOUT_LABEL[this._layout]}`;
	}

	getIcon(): string {
		switch (this._layout) {
			case "plotlines": return "git-branch";
			case "kanban": return "columns";
			case "plotgrid": return "grid";
			case "locations": return "map";
			default: return "clock";
		}
	}

	async onOpen(): Promise<void> {
		const ce = this.contentEl;
		ce.empty();
		ce.addClass("sf-ws");

		const head = ce.createDiv({ cls: "sf-ws-head" });
		head.createSpan({ cls: "sf-ws-brand", text: "Story Forge" });

		// Mode toggle — one pill per layout. The two M5 pills keep their exact
		// data-ws-layout hooks so existing tests + delegated routing are preserved.
		const toggle = head.createDiv({ cls: "sf-ws-toggle" });
		(["timeline", "plotlines", "kanban", "plotgrid", "locations"] as const).forEach((l) => {
			toggle
				.createEl("span", { cls: "sf-ws-mode", text: LAYOUT_LABEL[l] })
				.setAttribute("data-ws-layout", l);
		});
		this._toggleEl = toggle;

		// Timeline sub-controls: Rail|Swimlane toggle + By-key selector + zoom slot.
		// Only shown for the Timeline layout (visibility synced in _syncToggle).
		const tlBar = head.createDiv({ cls: "sf-ws-tlbar" });
		const modeGroup = tlBar.createDiv({ cls: "sf-ws-tlmode" });
		modeGroup.createEl("span", { cls: "sf-ws-tlmode-opt", text: "Rail" }).setAttribute("data-ws-tlmode", "rail");
		modeGroup.createEl("span", { cls: "sf-ws-tlmode-opt", text: "Swimlane" }).setAttribute("data-ws-tlmode", "swimlane");
		const keyGroup = tlBar.createDiv({ cls: "sf-ws-tlkey" });
		([["pov", "POV"], ["location", "Location"], ["plotline", "Plotline"]] as const).forEach(([k, label]) => {
			keyGroup.createEl("span", { cls: "sf-ws-tlkey-opt", text: label }).setAttribute("data-ws-swimkey", k);
		});
		this._timelineBarEl = tlBar;

		this._bodyEl = ce.createDiv({ cls: "sf-ws-body" });

		// aria-live region — announces committed keyboard writes (F8, AC-11).
		const live = ce.createDiv({ cls: "sf-ws-live sf-sr-only" });
		live.setAttribute("aria-live", "polite");
		live.setAttribute("role", "status");
		this._liveEl = live;

		// One InteractionHandler for the whole view (Kanban + Timeline placement).
		// Constructed once; destroyed in onClose (CON-4).
		this._handler = new InteractionHandler(this.app, ce, {
			onWrite: (file, entries): Promise<CommitResult> =>
				entries.length > 1
					? commitMany(this.app, file, entries)
					: commit(this.app, file, entries[0]!.key, entries[0]!.value, entries[0]!.field),
			onAfter: (): void => { this._render(); },
			onError: (file, result): void => { this._surfaceWriteError(file, result); },
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
		this._handler?.destroy();
		this._handler = null;
		this._collapse.clear();
		this.contentEl.empty();
	}

	/** Switch the layout and re-render. */
	setLayout(layout: WorkspaceLayout): void {
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
		const swimKey = this._swimKeyByScope.get(this._scopeKey) ?? "plotline";
		const keyOpts = this._timelineBarEl?.querySelectorAll<HTMLElement>("[data-ws-swimkey]") ?? [];
		keyOpts.forEach((m) => {
			m.classList.toggle("sf-ws-tlkey-opt--sel", m.getAttribute("data-ws-swimkey") === swimKey);
		});
	}

	private _render(): void {
		if (!this._bodyEl) return;
		const body = this._bodyEl;
		body.empty();

		const f = this.app.workspace.getActiveFile();

		// The Locations layout has its own scope (all location notes, ADR-19).
		if (this._layout === "locations") {
			this._scopeKey = "locations";
			this._syncToggle();
			this._renderLocations(body, f);
			return;
		}

		const { scope, scenes } = resolveWorkspaceScope(this.app, f);
		this._scopeKey = scope.kind === "none" ? "none" : `${scope.kind}:${scope.ref.path}`;
		this._syncToggle();

		if (scope.kind === "none") {
			body.createDiv({
				cls: "sf-ws-hint",
				text: "No book/plotline in focus — showing all scenes in the vault.",
			});
		}

		const rows = scenes.map((s) => mapSceneRow(this.app, s));
		const sourcePath = f?.path ?? "";
		const resolve: LinkResolver = (t) => this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);

		switch (this._layout) {
			case "timeline":
				this._renderTimeline(body, rows);
				break;
			case "kanban":
				this._renderKanban(body, rows);
				break;
			case "plotgrid":
				renderPlotgrid(body, plotgridModel(rows, resolve), {
					app: this.app,
					component: this,
					onAfter: (): void => { this._render(); },
				});
				break;
			default: // "plotlines"
				renderPlotlines(
					body,
					plotlineModel(rows, resolve),
					{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
					"list",
				);
		}
	}

	/** Timeline layout: rail (with zoom + placement drag) or swimlane (read-only). */
	private _renderTimeline(body: HTMLElement, rows: SceneRow[]): void {
		if (this._timelineMode === "swimlane") {
			const key = this._swimKeyByScope.get(this._scopeKey) ?? "plotline";
			const resolve: LinkResolver = (t) =>
				this.app.metadataCache.getFirstLinkpathDest(t, "");
			renderTimeline(
				body,
				swimlaneModel(rows, key, resolve),
				{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
				"swimlane",
			);
			return;
		}

		// Rail: wrap in the zoom controller, then bind each rail card to the handler
		// with a Timeline-placement Draggable that writes an integer storyDay (F3).
		const zoom = createTimelineZoom(body, this);
		renderTimeline(
			zoom.scaledEl,
			timelineModel(rows),
			{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
			"rail",
		);
		this._bindTimelinePlacement(zoom.scaledEl, rows);
	}

	/**
	 * Bind each rail scene *item* to the shared handler with a placement Draggable.
	 *
	 * The bound element is the `.sf-tl-item` wrapper (gutter + dot + card), NOT the
	 * `.sf-tl-card` itself — the card carries `data-sf-link` and the handler's
	 * drill-wins rule (AC-F8.3) aborts a drag that starts on a link. Starting the
	 * drag from the item's `when` gutter therefore places the scene, while a click
	 * on the card still drills. The item's `data-sf-item-path` carries the scene
	 * path for keyboard-move lookup. A drop computes an integer `storyDay` from the
	 * vertical drop ratio via `snapStoryDay` and writes ONLY `storyDay` (AC-F3.2).
	 */
	private _bindTimelinePlacement(scaled: HTMLElement, rows: SceneRow[]): void {
		if (!this._handler) return;
		const railEls = scaled.querySelectorAll<HTMLElement>(".sf-tl-rail");
		const byPath = new Map<string, SceneRow>(rows.map((r) => [r.file.path, r]));

		for (const rail of Array.from(railEls)) {
			const items = rail.querySelectorAll<HTMLElement>(".sf-tl-item");
			for (const item of Array.from(items)) {
				const path = item.querySelector<HTMLElement>(".sf-tl-card")?.getAttribute("data-sf-link");
				const row = path !== null && path !== undefined ? byPath.get(path) : undefined;
				if (!row) continue;
				item.setAttribute("data-sf-item-path", row.file.path);
				this._handler.bind(item, row.file, this._makePlacementDraggable(rail, rows));
			}
		}
	}

	/** A Timeline-placement Draggable: writes an integer `storyDay` (never `order`). */
	private _makePlacementDraggable(rail: HTMLElement, rows: SceneRow[]): Draggable {
		const dropRatio = (dropTarget: Element | null): number => {
			const box = rail.getBoundingClientRect();
			if (box.height <= 0 || !(dropTarget instanceof HTMLElement)) return 1;
			const tbox = dropTarget.getBoundingClientRect();
			const rel = (tbox.top + tbox.height / 2 - box.top) / box.height;
			return Math.max(0, Math.min(1, rel));
		};
		return {
			computeDrop: (_card: HTMLElement, dropTarget: Element | null): CommitEntry[] => {
				if (!dropTarget) return [];
				const day = snapStoryDay(rows, dropRatio(dropTarget));
				return [{ key: "storyDay", value: day, field: STORY_DAY_FIELD }];
			},
			computeKey: (card: HTMLElement, key: string): CommitEntry[] => {
				const path = card.getAttribute("data-sf-item-path") ?? "";
				const current = rows.find((r) => r.file.path === path)?.storyDay ?? 1;
				if (key === "Alt+ArrowUp") {
					return [{ key: "storyDay", value: Math.max(1, current - 1), field: STORY_DAY_FIELD }];
				}
				if (key === "Alt+ArrowDown") {
					return [{ key: "storyDay", value: current + 1, field: STORY_DAY_FIELD }];
				}
				return [];
			},
		};
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

	/** Locations layout: nested world/location tree (read-only, ADR-19). */
	private _renderLocations(body: HTMLElement, f: TFile | null): void {
		const files = resolveLocationScope(this.app);
		const rows = files.map((file) => mapLocationRow(this.app, file));
		const sourcePath = f?.path ?? "";
		const resolve: LinkResolver = (t) => this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);
		renderLocationsTree(
			body,
			locationTreeModel(rows, resolve),
			{ isCollapsed: (k) => this._collapse.isCollapsed("main", this._scopeKey, k) },
		);
	}

	// --- Write-error surface (ADR-24) ---------------------------------------

	/** Mark the offending card with an error class + fire a transient Notice. */
	private _surfaceWriteError(file: TFile, result: CommitResult): void {
		const card = this._findCardEl(file.path);
		card?.classList.add("sf-card--error");
		const message = result.ok ? "" : result.message;
		new Notice(message);
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

	private _onClick(target: EventTarget | null, modifier: boolean): void {
		if (!(target instanceof HTMLElement)) return;

		// Layout mode toggle.
		const modeEl = target.closest("[data-ws-layout]");
		if (modeEl instanceof HTMLElement) {
			const l = modeEl.getAttribute("data-ws-layout");
			if (isLayout(l)) this.setLayout(l);
			return;
		}

		// Timeline sub-mode (Rail | Swimlane).
		const tlModeEl = target.closest("[data-ws-tlmode]");
		if (tlModeEl instanceof HTMLElement) {
			const m = tlModeEl.getAttribute("data-ws-tlmode");
			if (m === "rail" || m === "swimlane") {
				this._timelineMode = m;
				this._syncToggle();
				this._render();
			}
			return;
		}

		// Swimlane grouping key (persisted per-scope, ADR-20).
		const keyEl = target.closest("[data-ws-swimkey]");
		if (keyEl instanceof HTMLElement) {
			const k = keyEl.getAttribute("data-ws-swimkey");
			if (isSwimlaneKey(k)) {
				this._swimKeyByScope.set(this._scopeKey, k);
				this._syncToggle();
				this._render();
			}
			return;
		}

		// Link (drill/open) FIRST — a nearest data-sf-link wins over a surrounding section
		// header, so an act label / dot / card field drills while the chevron collapses.
		const linkEl = target.closest("[data-sf-link]");
		if (linkEl instanceof HTMLElement) {
			const path = linkEl.getAttribute("data-sf-link");
			if (path !== null && path !== "") {
				const file =
					this.app.vault.getAbstractFileByPath(path) ??
					this.app.metadataCache.getFirstLinkpathDest(path, "");
				if (file instanceof TFile) {
					const action = this.getLinkClickAction();
					const drill = action === "drill" ? !modifier : modifier;
					if (drill) this._drill(file);
					else void this.app.workspace.openLinkText(file.path, "", false);
				}
			}
			return;
		}

		// Section header (chevron / rest) — collapse, persist + re-render.
		const secHead = target.closest("[data-sf-section-toggle]");
		if (secHead instanceof HTMLElement) {
			const key = secHead.getAttribute("data-sf-group-key");
			if (key) {
				this._collapse.toggle("main", this._scopeKey, key);
				this._render();
			}
		}
	}
}
