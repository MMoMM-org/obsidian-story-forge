/**
 * WorkspaceView — the main-area workspace host (M5 read views + M6 interactive views).
 *
 * One polymorphic `ItemView` (ADR-16) with a header toolbar. It follows the active
 * note (active-leaf-change), resolves scope via the shared core, maps rows, and routes
 * to one of four layouts:
 *
 *   timeline  — rail OR swimlane (read; M6 adds swimlane + zoom)
 *   plotlines — Plotlines list (read, M5)
 *   kanban    — status columns, drag→status+order write-back (M6)
 *   plotgrid  — plotline × scene matrix, click-toggle plotlines write-back (M6)
 *
 * The view OWNS one `InteractionHandler` (constructed in onOpen, destroyed in onClose —
 * CON-4) used by the Kanban board; the Plotgrid uses a click-toggle (not the drag
 * machine). A write:
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

import { Component, ItemView, Notice, TFile, debounce, type WorkspaceLeaf } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import { revealAndShowFile } from "views/SidebarView";
import { resolveWorkspaceScope } from "scoping/workspaceScope";
import { mapSceneRow } from "workspace/sceneMapper";
import {
	timelineModel,
	plotlineModel,
	kanbanModel,
	plotgridModel,
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

export const WORKSPACE_VIEW_TYPE = "story-forge-workspace";

export type WorkspaceLayout = "timeline" | "plotlines" | "kanban" | "plotgrid";

/** The Timeline sub-mode toggle (ADR-16 / mockup S62 vs S76). */
type TimelineMode = "rail" | "swimlane";

/** The status vocabulary that seeds the Kanban columns (mirrors schema/scene.json). */
const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

/** The `order` field spec used by the Kanban renumber path. */
const ORDER_FIELD = { name: "order", type: "number" as const };

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
		v === "plotgrid"
	);
}

function isSwimlaneKey(v: unknown): v is SwimlaneKey {
	return v === "pov" || v === "location" || v === "plotline";
}

/** Human labels for the four layout modes (sentence-case UI). */
const LAYOUT_LABEL: Record<WorkspaceLayout, string> = {
	timeline: "Timeline",
	plotlines: "Plotlines",
	kanban: "Kanban",
	plotgrid: "Plotgrid",
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
	private _keySelectEl: HTMLSelectElement | null = null;
	private _zoomSlotEl: HTMLElement | null = null;
	private _liveEl: HTMLElement | null = null;
	private _handler: InteractionHandler | null = null;
	/** Child Component owning the current zoom listeners. Replaced on every rail render. */
	private _zoomChild: Component | null = null;
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
		(["timeline", "plotlines", "kanban", "plotgrid"] as const).forEach((l) => {
			toggle
				.createEl("span", { cls: "sf-ws-mode", text: LAYOUT_LABEL[l] })
				.setAttribute("data-ws-layout", l);
		});
		this._toggleEl = toggle;

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

		// Zoom controls slot — the actual controls bar is mounted here per-render
		// (createTimelineZoom places its .sf-zoom-bar in this host; the scaled body
		// goes into the main body). Kept empty in swimlane mode.
		this._zoomSlotEl = tlBar.createDiv({ cls: "sf-ws-zoomslot" });
		this._timelineBarEl = tlBar;

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

		const f = this.app.workspace.getActiveFile();

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
			case "plotlines":
				renderPlotlines(
					body,
					plotlineModel(rows, resolve),
					{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
					"list",
				);
		}
	}

	/** Timeline layout: rail (with zoom, read-only) or swimlane grid (read-only). */
	private _renderTimeline(body: HTMLElement, rows: SceneRow[]): void {
		// Tear down the previous zoom child (releases its 4 DOM listeners) so they
		// don't accumulate across re-renders triggered by metadataCache.changed (ADR-22).
		if (this._zoomChild !== null) {
			this.removeChild(this._zoomChild);
			this._zoomChild = null;
		}
		// The zoom controls live in the toolbar slot; reset it each render.
		this._zoomSlotEl?.empty();

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

		// Rail: fresh child Component owns the 4 zoom listeners this render cycle.
		// Each re-render removes the previous child (unloading its listeners) and
		// creates a new one — preventing unbounded listener accumulation.
		const zoomChild = new Component();
		this.addChild(zoomChild);
		this._zoomChild = zoomChild;

		// Rail: split zoom — controls in the toolbar slot, scaled body in the main
		// body. Read-only — drill only, no placement drag.
		const zoom = createTimelineZoom(zoomChild, {
			controlsHost: this._zoomSlotEl ?? body,
			scaledHost: body,
		});
		renderTimeline(
			zoom.scaledEl,
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
