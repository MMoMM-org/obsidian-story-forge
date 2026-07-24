/**
 * WorkspaceView — the main-area Timeline/Plotlines view (M5, ADR-2/-3).
 *
 * One polymorphic `ItemView` with a Timeline | Plotlines header toggle. It follows the
 * active note (active-leaf-change), resolves scope via the shared core, and renders the
 * Timeline **rail** or the Plotlines **list** (P3 render blocks). Scene clicks drill the
 * sidebar Context panel via `revealAndShowFile`. Read-only in M5 (swimlane/subway = M6).
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-2, ADR-3, ADR-13
 */

import { ItemView, TFile, debounce, type WorkspaceLeaf } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import { revealAndShowFile } from "views/SidebarView";
import { resolveWorkspaceScope } from "scoping/workspaceScope";
import { mapSceneRow } from "workspace/sceneMapper";
import { timelineModel, plotlineModel, type LinkResolver } from "workspace/workspaceModel";
import { renderTimeline } from "workspace/renderTimeline";
import { renderPlotlines } from "workspace/renderPlotlines";
import { CollapseStore } from "workspace/collapseStore";

export const WORKSPACE_VIEW_TYPE = "story-forge-workspace";

export type WorkspaceLayout = "timeline" | "plotlines";

export interface WorkspaceViewOpts {
	/** Reads the live link-click setting (getter — main.ts reassigns settings). */
	getLinkClickAction?: () => "drill" | "open";
	/** Drill seam — injected for testability; defaults to the sidebar Context drill. */
	drill?: (file: TFile) => void;
}

function isLayout(v: unknown): v is WorkspaceLayout {
	return v === "timeline" || v === "plotlines";
}

export class WorkspaceView extends ItemView {
	private _layout: WorkspaceLayout = "timeline";
	private readonly _collapse = new CollapseStore();
	private _scopeKey = "none";
	private _bodyEl: HTMLElement | null = null;
	private _toggleEl: HTMLElement | null = null;
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
		return this._layout === "timeline" ? "Story Forge Timeline" : "Story Forge Plotlines";
	}

	getIcon(): string {
		return this._layout === "timeline" ? "clock" : "git-branch";
	}

	async onOpen(): Promise<void> {
		const ce = this.contentEl;
		ce.empty();
		ce.addClass("sf-ws");

		const head = ce.createDiv({ cls: "sf-ws-head" });
		head.createSpan({ cls: "sf-ws-brand", text: "Story Forge" });
		const toggle = head.createDiv({ cls: "sf-ws-toggle" });
		toggle.createEl("span", { cls: "sf-ws-mode", text: "Timeline" }).setAttribute("data-ws-layout", "timeline");
		toggle.createEl("span", { cls: "sf-ws-mode", text: "Plotlines" }).setAttribute("data-ws-layout", "plotlines");
		this._toggleEl = toggle;

		this._bodyEl = ce.createDiv({ cls: "sf-ws-body" });

		// One delegated click router on the persistent contentEl (survives body.empty()).
		this.registerDomEvent(ce, "click", (e: MouseEvent) => {
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Keyboard parity: Enter/Space on a focused card or section header.
		this.registerDomEvent(ce, "keydown", (e: KeyboardEvent) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			this._onClick(e.target, e.metaKey || e.ctrlKey);
		});
		// Follow the active note.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => { this._debouncedRender(); }));

		this._syncToggle();
		this._render();
	}

	async onClose(): Promise<void> {
		this._debouncedRender.cancel();
		this._collapse.clear();
		this.contentEl.empty();
	}

	/** Switch the layout (Timeline ↔ Plotlines) and re-render. */
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
	}

	private _render(): void {
		if (!this._bodyEl) return;
		const body = this._bodyEl;
		body.empty();

		const f = this.app.workspace.getActiveFile();
		const { scope, scenes } = resolveWorkspaceScope(this.app, f);
		this._scopeKey = scope.kind === "none" ? "none" : `${scope.kind}:${scope.ref.path}`;

		if (scope.kind === "none") {
			body.createDiv({
				cls: "sf-ws-hint",
				text: "No book/plotline in focus — showing all scenes in the vault.",
			});
		}

		const rows = scenes.map((s) => mapSceneRow(this.app, s));

		if (this._layout === "timeline") {
			renderTimeline(
				body,
				timelineModel(rows),
				{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
				"rail",
			);
		} else {
			const sourcePath = f?.path ?? "";
			const resolve: LinkResolver = (t) => this.app.metadataCache.getFirstLinkpathDest(t, sourcePath);
			renderPlotlines(
				body,
				plotlineModel(rows, resolve),
				{ isCollapsed: (g) => this._collapse.isCollapsed("main", this._scopeKey, g) },
				"list",
			);
		}
	}

	private _onClick(target: EventTarget | null, modifier: boolean): void {
		if (!(target instanceof HTMLElement)) return;

		// Layout toggle.
		const modeEl = target.closest("[data-ws-layout]");
		if (modeEl instanceof HTMLElement) {
			const l = modeEl.getAttribute("data-ws-layout");
			if (isLayout(l)) this.setLayout(l);
			return;
		}

		// Plotlines section collapse — persist + re-render.
		const secHead = target.closest("[data-sf-section-toggle]");
		if (secHead instanceof HTMLElement) {
			const key = secHead.getAttribute("data-sf-group-key");
			if (key) {
				this._collapse.toggle("main", this._scopeKey, key);
				this._render();
			}
			return;
		}

		// Scene link — drill (plain) or open (modifier), per the setting XOR modifier.
		const linkEl = target.closest("[data-sf-link]");
		if (!linkEl) return;
		const path = linkEl.getAttribute("data-sf-link");
		if (!path) return;
		const file =
			this.app.vault.getAbstractFileByPath(path) ??
			this.app.metadataCache.getFirstLinkpathDest(path, "");
		if (!(file instanceof TFile)) return;

		const action = this.getLinkClickAction();
		const drill = action === "drill" ? !modifier : modifier;
		if (drill) this._drill(file);
		else void this.app.workspace.openLinkText(file.path, "", false);
	}
}
