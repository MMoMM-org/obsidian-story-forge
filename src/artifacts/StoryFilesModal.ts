/**
 * StoryFilesModal — the "Set up story files" dialog, one dialog for setup and update, built to
 * the signed-off mockups `docs/XDD/specs/010-ship-vault-artifacts/mockups.html` S2–S5.
 *
 * - Three set cards (D4): checkbox, name, file count, folder field, chips; rows collapsed unless
 *   the set holds something to look at (a skip, missing, unreadable or damaged file).
 * - One row per planned file (D5): rows that write carry their own checkbox; a Missing row starts
 *   unticked with the visible label "Set up again" (PRD F4.5, O5). Reason lines are the writer's
 *   refusal texts word for word (O4), except a file already there without a record: "Already
 *   there", dimmed, with its own reason line and a set line when the whole set is in that state (R1).
 * - A folder change replans its set as a preview only; the setting is saved only on confirm, and
 *   Cancel, Escape and ✕ change nothing (D7, O1).
 * - A folder outside the excluded folders shows the warning (D9) — same `isExcluded` as the
 *   scopes — with a button that changes the Excluded folders setting only (no file written).
 * - The primary button counts what it writes (D6); it is the only control that writes a file.
 *   Confirm runs `executePlan` and shows one Notice (D10, O6).
 *
 * DOM safety: no innerHTML — element helpers only. Popout-safe: no global `document`; the result
 * notice is drawn into its own `messageEl`, never passed as a fragment.
 *
 * @ref SDD/ADR-42, SDD/Primary Flow, SDD/Error Handling
 * @ref PRD/F2.3, F2.5, F2.6, F2.7, F3.2, F3.3, F4.5
 */

import { Modal, Notice, TFolder } from "obsidian";
import type { App } from "obsidian";
import { attachFolderSuggest } from "settings/suggesters";
import { isExcluded } from "scoping/workspaceScope";
import { normalizeFileClassesFolder, normalizeSchemaFolder, normalizeTemplatesFolder } from "types/index";
import type { PluginSettings } from "types/index";
import { editedRefusal, parentFolderOf, readExisting } from "../vault/managedFileWriter";
import type { ArtifactStore } from "./ArtifactStore";
import type {
	ArtifactEntry,
	ArtifactFileRead,
	ArtifactFolders,
	ArtifactIndex,
	ArtifactPlaceholder,
	ArtifactSet,
	PlanAction,
	PlanItem,
} from "./artifactTypes";
import { executePlan, type ExecutePlanResult, type PlanOutcome } from "./executePlan";
import { planSetup, targetPathOf } from "./planSetup";
import { normalizeFolder } from "./resolvePlaceholders";
import { composeNotice, damagedRefusal, type PlannedWrite } from "./storyFilesNotice";

/** The settings the dialog reads. */
export type StoryFilesSettings = Pick<PluginSettings, ArtifactPlaceholder | "excludedFolders">;

export interface StoryFilesDeps {
	app: App;
	/** Current settings, read on open and after the excluded folders change. */
	settings: () => StoryFilesSettings;
	/** Save the three folder settings; called on confirm only, and only when one changed. */
	saveFolders: (folders: ArtifactFolders) => Promise<void>;
	/** Append `folder` to the Excluded folders setting (the Scope tab's store call). */
	addExcludedFolder: (folder: string) => Promise<void>;
	store: ArtifactStore;
	index: ArtifactIndex;
	pluginVersion: string;
}

const SETS: readonly { set: ArtifactSet; name: string; key: ArtifactPlaceholder }[] = [
	{ set: "fileclasses", name: "FileClasses", key: "fileClassesFolder" },
	{ set: "templates", name: "Templates", key: "templatesFolder" },
	{ set: "schema", name: "Schema reference", key: "schemaFolder" },
];

const INSTALLED = "Not installed";

/** The settings fields' normalisers: an emptied or malformed field falls back to the default folder. */
const NORMALIZE: Record<ArtifactPlaceholder, (v: unknown) => string> = {
	fileClassesFolder: normalizeFileClassesFolder,
	templatesFolder: normalizeTemplatesFolder,
	schemaFolder: normalizeSchemaFolder,
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

type Kind = "create" | "update" | "ok" | "skip" | "bad" | "missing";

const ACTION: Record<PlanAction, { label: string; chip: string; kind: Kind }> = {
	create: { label: "Create", chip: "create", kind: "create" },
	update: { label: "Update", chip: "update", kind: "update" },
	"up-to-date": { label: "Up to date", chip: "up to date", kind: "ok" },
	"skip-edited": { label: "Not updated", chip: "edited", kind: "skip" },
	"skip-exists": { label: "Already there", chip: "already there", kind: "ok" },
	missing: { label: "Missing", chip: "missing", kind: "missing" },
	unreadable: { label: "Unreadable", chip: "unreadable", kind: "bad" },
	refused: { label: "Damaged", chip: "damaged", kind: "bad" },
};

/** Chip order: what is written, then what stays, then what needs you. */
const CHIP_ORDER: readonly PlanAction[] = ["create", "update", "up-to-date", "skip-exists", "skip-edited", "missing", "unreadable", "refused"];

const writes = (a: PlanAction): boolean => a === "create" || a === "update" || a === "missing";
const opensSet = (a: PlanAction): boolean => a !== "create" && a !== "update" && a !== "up-to-date";

/** Dimmed rows: nothing to write and nothing that needs you (Up to date, Already there, R1). */
const dims = (a: PlanAction): boolean => a === "up-to-date" || a === "skip-exists";

/** Row order (S3 note, R1): rows that write, then rows that need you, then the dimmed rows. */
function rowGroup(a: PlanAction): number {
	if (writes(a)) return 0;
	return dims(a) ? 2 : 1;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The FileClass whose value list `entry` is (S2b hint), by its `valuesListNotePath`. */
function valueListUser(entry: ArtifactEntry, index: ArtifactIndex): string | undefined {
	const needle = `/${entry.relPath}`;
	const user = index.entries.find(
		(e) => e !== entry && e.set === entry.set && e.source.split("\n").some((l) => l.includes("valuesListNotePath:") && l.trimEnd().endsWith(needle)),
	);
	return user?.relPath.replace(/\.md$/, "");
}

/** The folder a record path sits in, for an entry whose relPath it ends with. */
function folderOfRecord(item: PlanItem): string {
	const suffix = `/${item.entry.relPath}`;
	return item.path.endsWith(suffix) ? item.path.slice(0, -suffix.length) : parentFolderOf(item.path);
}

interface SetView {
	card: HTMLElement;
	box: HTMLInputElement;
	input: HTMLInputElement;
	dyn: HTMLElement;
	rows: HTMLElement;
	toggle: HTMLButtonElement;
	expanded: boolean;
	/** The folder the shown plan was computed for: what confirm saves and writes with. */
	planned: string;
	/** A failed replan, shown in the card until the next successful one. */
	error: string | null;
	/** Replan generation: a stale replan's result is dropped. */
	gen: number;
}

export class StoryFilesModal extends Modal {
	private folders: ArtifactFolders;
	private readonly saved: ArtifactFolders;
	private plan = new Map<ArtifactSet, PlanItem[]>();
	private readonly ticked = new Set<string>();
	/** Read refusals by path ("Not installed: could not read …"), from the last plan. */
	private readonly readRefusals = new Map<string, string>();
	/** Sets whose folder was added to the excluded folders in this dialog (S4b line). */
	private readonly added = new Set<ArtifactSet>();
	private readonly views = new Map<ArtifactSet, SetView>();
	private pending = 0;
	private busy = false;
	private closed = false;
	private primaryBtn: HTMLButtonElement | null = null;
	private cancelBtn: HTMLButtonElement | null = null;
	private asideEl: HTMLElement | null = null;
	private ids = 0;

	constructor(private readonly deps: StoryFilesDeps) {
		super(deps.app);
		const s = deps.settings();
		this.saved = { fileClassesFolder: s.fileClassesFolder, templatesFolder: s.templatesFolder, schemaFolder: s.schemaFolder };
		this.folders = { ...this.saved };
	}

	onOpen(): void {
		this.closed = false;
		this.modalEl.addClass("sf-story-modal");
		void this._start();
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
		this.views.clear();
	}

	// ---------------------------------------------------------------------------
	// Planning
	// ---------------------------------------------------------------------------

	private readonly readFile = async (path: string): Promise<ArtifactFileRead> => {
		const found = await readExisting(this.app, path, INSTALLED);
		if ("refusal" in found) {
			this.readRefusals.set(path, found.refusal);
			return { kind: "unreadable", reason: found.refusal };
		}
		if ("absent" in found) return { kind: "absent" };
		return { kind: "content", text: found.content };
	};

	private async _planSets(sets: readonly ArtifactSet[]): Promise<Map<ArtifactSet, PlanItem[]>> {
		const items = await planSetup(this.deps.index, this.deps.store.all(), this.readFile, { ...this.folders }, sets);
		const out = new Map<ArtifactSet, PlanItem[]>();
		for (const set of sets) out.set(set, this._ordered(items.filter((i) => i.entry.set === set)));
		return out;
	}

	private _ordered(items: PlanItem[]): PlanItem[] {
		const readmeFirst = (i: PlanItem): number => (i.entry.relPath === "README.md" ? 0 : 1);
		return [...items].sort((a, b) => rowGroup(a.action) - rowGroup(b.action) || readmeFirst(a) - readmeFirst(b));
	}

	/** Default ticks for a set's items: create and update ticked, missing unticked (F4.5). */
	private _tickDefaults(items: readonly PlanItem[]): void {
		for (const item of items) {
			if (item.action === "create" || item.action === "update") this.ticked.add(item.entry.id);
			else this.ticked.delete(item.entry.id);
		}
	}

	private async _start(): Promise<void> {
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-story");
		el.createEl("h2", { text: "Set up story files" });
		el.createEl("p", {
			cls: "sf-picker-sub",
			text: "Story Forge writes these notes into your vault when you select the button below. It never overwrites a file that is already there.",
		});
		let plan: Map<ArtifactSet, PlanItem[]>;
		try {
			await this.deps.store.load();
			plan = await this._planSets(SETS.map((s) => s.set));
		} catch (err) {
			if (this.closed) return;
			el.createEl("p", { cls: "sf-picker-feedback", text: `Could not read the story files: ${messageOf(err)}` });
			this._renderFoot(el);
			return;
		}
		if (this.closed) return;
		this.plan = plan;
		for (const items of plan.values()) this._tickDefaults(items);

		const body = el.createDiv({ cls: "sf-story-body" });
		for (const s of SETS) this._renderSet(body, s);
		this._renderFoot(el);
		this._refresh();
		const first = [...this.views.values()].map((v) => v.box).find((b) => !b.disabled);
		(first ?? this.cancelBtn)?.focus();
	}

	/** Replan one set after its folder changed (preview only, nothing saved). */
	private async _replan(set: ArtifactSet): Promise<void> {
		const view = this.views.get(set);
		if (!view) return;
		const key = this._keyOf(set);
		const folder = this.folders[key];
		const gen = ++view.gen;
		this.pending++;
		this._refreshFoot();
		let outcome: { items: PlanItem[] } | { error: unknown };
		try {
			outcome = { items: (await this._planSets([set])).get(set) ?? [] };
		} catch (err) {
			console.error("[StoryForge] could not plan story files", err);
			outcome = { error: err };
		} finally {
			this.pending--;
		}
		if (this.closed) return;
		// A newer replan of this set is on its way: drop this result, only the button may change.
		if (gen !== view.gen) {
			this._refreshFoot();
			return;
		}
		if ("items" in outcome) {
			this.plan.set(set, outcome.items);
			this._tickDefaults(outcome.items);
			view.planned = folder;
			view.error = null;
			view.card.dataset["folder"] = folder;
		} else {
			// The shown plan is still the old folder's: go back to it, so confirm never mixes the two.
			view.error = `Could not check ${folder}: ${messageOf(outcome.error)}. The folder stays ${view.planned}.`;
			this.folders = { ...this.folders, [key]: view.planned };
			view.input.value = view.planned;
		}
		this._renderDyn(set);
		this._renderRows(set);
		this._refresh();
	}

	private _keyOf(set: ArtifactSet): ArtifactPlaceholder {
		return SETS.find((s) => s.set === set)!.key;
	}

	// ---------------------------------------------------------------------------
	// Set card
	// ---------------------------------------------------------------------------

	private _id(prefix: string): string {
		return `sf-story-${prefix}-${++this.ids}`;
	}

	private _renderSet(body: HTMLElement, s: (typeof SETS)[number]): void {
		const nameId = this._id("name");
		const rowsId = this._id("rows");
		const card = body.createDiv({ cls: "sf-story-set", attr: { role: "group", "aria-labelledby": nameId, "data-set": s.set, "data-folder": this.folders[s.key] } });
		const head = card.createDiv({ cls: "sf-story-head" });
		const box = head.createEl("input", { cls: "sf-story-set-cb", type: "checkbox", attr: { "aria-labelledby": nameId } });
		box.addEventListener("change", () => this._onSetBox(s.set, box.checked));
		const name = head.createSpan({ cls: "sf-story-title", attr: { id: nameId } });
		name.createSpan({ cls: "sf-story-set-name", text: s.name });
		const count = this.deps.index.entries.filter((e) => e.set === s.set).length;
		name.createSpan({ cls: "sf-story-set-count", text: plural(count, "file", "files") });
		const items = this.plan.get(s.set) ?? [];
		const expanded = items.some((i) => opensSet(i.action));
		const toggle = head.createEl("button", {
			cls: "sf-story-toggle",
			attr: { type: "button", "aria-expanded": String(expanded), "aria-controls": rowsId },
		});
		const fold = head.createDiv({ cls: "sf-story-folder" });
		const inputId = this._id("folder");
		fold.createEl("label", { text: "Folder", attr: { for: inputId } });
		const input = fold.createEl("input", { type: "text", attr: { id: inputId, spellcheck: "false" } });
		input.value = this.folders[s.key];
		attachFolderSuggest(this.app, input, { list: false });
		input.addEventListener("change", () => this._onFolder(s.set, input));
		const dyn = head.createDiv({ cls: "sf-story-dyn" });
		const rows = card.createDiv({ cls: "sf-story-rows", attr: { id: rowsId } });
		const view: SetView = { card, box, input, dyn, rows, toggle, expanded, planned: this.folders[s.key], error: null, gen: 0 };
		toggle.addEventListener("click", () => {
			view.expanded = !view.expanded;
			this._applyExpanded(view);
		});
		this.views.set(s.set, view);
		this._applyExpanded(view);
		this._renderDyn(s.set);
		this._renderRows(s.set);
	}

	private _applyExpanded(view: SetView): void {
		view.toggle.textContent = view.expanded ? "▾ Hide files" : "▸ Show files";
		view.toggle.setAttribute("aria-expanded", String(view.expanded));
		view.rows.toggle(view.expanded);
	}

	private _onFolder(set: ArtifactSet, input: HTMLInputElement): void {
		const key = this._keyOf(set);
		const next = normalizeFolder(NORMALIZE[key](input.value.trim()));
		input.value = next;
		if (next === this.folders[key]) return;
		this.folders = { ...this.folders, [key]: next };
		this.added.delete(set);
		void this._replan(set);
	}

	/** Moved note (D8), excluded warning or its S4b line (D9), chips (D4). */
	private _renderDyn(set: ArtifactSet): void {
		const view = this.views.get(set);
		if (!view) return;
		const dyn = view.dyn;
		dyn.empty();
		if (view.error !== null) dyn.createDiv({ cls: ["sf-story-error", "sf-picker-feedback"], attr: { role: "alert" }, text: view.error });
		const folder = this.folders[this._keyOf(set)];
		const items = this.plan.get(set) ?? [];

		const recordFolder = this._movedFolder(items);
		if (recordFolder !== undefined) {
			const note = dyn.createDiv({ cls: "sf-story-moved" });
			note.appendText("These files were set up in ");
			note.createSpan({ cls: "sf-story-path", text: recordFolder });
			note.appendText(". The setting now points to ");
			note.createSpan({ cls: "sf-story-path", text: folder });
			note.appendText("; updates stay where the files are. Files set up from now on go to the new folder.");
		}

		if (items.length > 0 && items.every((i) => i.action === "skip-exists")) this._renderAllThere(dyn, items.length, folder);

		const excluded = this.deps.settings().excludedFolders;
		if (!isExcluded(folder, excluded)) this._renderWarn(dyn, set, folder, excluded);
		else if (this.added.has(set)) {
			dyn.createDiv({
				cls: "sf-story-note",
				attr: { role: "status" },
				text: `✓ ${folder} added to your excluded folders. Change them in Settings › Scope › Excluded folders.`,
			});
		}

		const chips = dyn.createDiv({ cls: "sf-story-chips" });
		for (const action of CHIP_ORDER) {
			const n = items.filter((i) => i.action === action).length;
			if (n > 0) chips.createSpan({ cls: ["sf-story-chip", `is-${ACTION[action].kind}`], text: `${n} ${ACTION[action].chip}` });
		}
	}

	/** The most common record folder of the items set up elsewhere than the folder now names (D8). */
	private _movedFolder(items: readonly PlanItem[]): string | undefined {
		const counts = new Map<string, number>();
		for (const item of items) {
			if (item.path === targetPathOf(item.entry, this.folders)) continue;
			const folder = folderOfRecord(item);
			counts.set(folder, (counts.get(folder) ?? 0) + 1);
		}
		let best: string | undefined;
		for (const [folder, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0)) best = folder;
		return best;
	}

	/** The set line when every file of the set is already there, not written by Story Forge (R1). */
	private _renderAllThere(dyn: HTMLElement, n: number, folder: string): void {
		const note = dyn.createDiv({ cls: ["sf-story-moved", "sf-story-there"], attr: { role: "note" } });
		note.appendText(n === 1 ? "The file is already in " : `All ${n} files are already in `);
		note.createSpan({ cls: "sf-story-path", text: folder });
		note.appendText(
			n === 1
				? ", and Story Forge did not write it, so it leaves it alone and will not update it. To get Story Forge's copy, choose another folder, or move this file away first."
				: ", and Story Forge did not write them, so it leaves them alone and will not update them. To get Story Forge's copies, choose another folder, or move these files away first.",
		);
	}

	private _renderWarn(dyn: HTMLElement, set: ArtifactSet, folder: string, excluded: readonly string[]): void {
		const warn = dyn.createDiv({ cls: "sf-story-warn", attr: { role: "note" } });
		warn.createEl("strong", { text: "▲ Not in your excluded folders." });
		warn.appendText(" Notes in ");
		warn.createSpan({ cls: "sf-story-path", text: folder });
		warn.appendText(" will be treated as story entities: they show up in the Anvil, the Workbench and your collections next to your real characters and scenes. ");
		if (excluded.length === 0) warn.appendText("You have no excluded folders.");
		else {
			warn.appendText("Your excluded folders are ");
			warn.createSpan({ cls: "sf-story-path", text: excluded.join(", ") });
			warn.appendText(".");
		}
		const btn = warn.createDiv().createEl("button", { text: `Add ${folder} to excluded folders`, attr: { type: "button" } });
		btn.addEventListener("click", () => void this._addExcluded(set, folder, btn));
	}

	private async _addExcluded(set: ArtifactSet, folder: string, btn: HTMLButtonElement): Promise<void> {
		btn.disabled = true;
		try {
			await this.deps.addExcludedFolder(folder);
		} catch (err) {
			console.error("[StoryForge] could not add the excluded folder", err);
			new Notice(`Could not add ${folder} to excluded folders: ${messageOf(err)}`);
			btn.disabled = false;
			return;
		}
		if (this.closed) return;
		this.added.add(set);
		for (const s of SETS) this._renderDyn(s.set);
	}

	// ---------------------------------------------------------------------------
	// Rows
	// ---------------------------------------------------------------------------

	private _renderRows(set: ArtifactSet): void {
		const view = this.views.get(set);
		if (!view) return;
		view.rows.empty();
		const items = this.plan.get(set) ?? [];
		const noteFolder = this._movedFolder(items);
		for (const item of items) this._renderRow(view.rows, item, noteFolder);
	}

	private _renderRow(host: HTMLElement, item: PlanItem, noteFolder: string | undefined): void {
		const meta = ACTION[item.action];
		const row = host.createDiv({ cls: "sf-story-row", attr: { "data-path": item.path } });
		if (dims(item.action)) row.addClass("is-dim");
		const fileId = this._id("file");
		const check = row.createSpan({ cls: "sf-story-row-check" });
		let box: HTMLInputElement | null = null;
		if (writes(item.action)) {
			box = check.createEl("input", { cls: "sf-story-row-cb", type: "checkbox", attr: { id: this._id("cb"), "aria-labelledby": fileId } });
			box.checked = this.ticked.has(item.entry.id);
			const b = box;
			b.addEventListener("change", () => {
				if (b.checked) this.ticked.add(item.entry.id);
				else this.ticked.delete(item.entry.id);
				this._refresh();
			});
		}
		const atTarget = item.path === targetPathOf(item.entry, this.folders);
		const inNoteFolder = noteFolder !== undefined && folderOfRecord(item) === noteFolder;
		const file = row.createSpan({ cls: "sf-story-file", attr: { id: fileId } });
		file.appendText(atTarget || inNoteFolder ? item.entry.relPath : item.path);
		const user = valueListUser(item.entry, this.deps.index);
		if (user !== undefined) file.createEl("i", { cls: "sf-story-hint", text: `value list for ${user}` });

		const end = row.createSpan({ cls: "sf-story-end" });
		if (item.action === "missing" && box) {
			box.setAttribute("aria-labelledby", `${this._renderAgainLabel(end, box)} ${fileId}`);
		}
		end.createSpan({ cls: ["sf-story-act", `is-${meta.kind}`], text: meta.label });
		this._renderWhy(row, item);
	}

	/** Draw the visible "Set up again" label of a Missing row (O5); returns its id. */
	private _renderAgainLabel(end: HTMLElement, box: HTMLInputElement): string {
		const id = this._id("again");
		end.createEl("label", { cls: "sf-story-again", text: "Set up again", attr: { for: box.id, id } });
		return id;
	}

	private _renderWhy(row: HTMLElement, item: PlanItem): void {
		switch (item.action) {
			case "skip-exists":
				row.createDiv({
					cls: "sf-story-why",
					text: item.sameContent === true
						? "Same content as Story Forge's copy, but not written by Story Forge."
						: "Your own file, different from Story Forge's copy. Story Forge never overwrites it.",
				});
				return;
			case "skip-edited":
				row.createDiv({ cls: "sf-story-why", text: editedRefusal(item.path, "Not updated") });
				return;
			case "missing": {
				const why = row.createDiv({ cls: "sf-story-why" });
				why.appendText(`${item.path} was set up but is no longer there. It is not recreated unless you tick `);
				why.createEl("em", { text: "Set up again" });
				why.appendText(".");
				return;
			}
			case "unreadable":
				row.createDiv({ cls: ["sf-story-why", "is-error"], text: this._readRefusal(item) });
				return;
			case "refused": {
				const why = row.createDiv({ cls: ["sf-story-why", "is-error"] });
				why.createSpan({ text: damagedRefusal("this file") });
				// The raw reason from planSetup, as renderFeedback's raw line (L10 Q8).
				if (item.note !== undefined) why.createSpan({ cls: "sf-catalog-raw", text: item.note });
				return;
			}
			default:
				return;
		}
	}

	private _readRefusal(item: PlanItem): string {
		return this.readRefusals.get(item.path) ?? `${INSTALLED}: could not read ${item.path}`;
	}

	// ---------------------------------------------------------------------------
	// Selection state, footer
	// ---------------------------------------------------------------------------

	private _onSetBox(set: ArtifactSet, on: boolean): void {
		for (const item of this.plan.get(set) ?? []) {
			if (!writes(item.action)) continue;
			if (on) this.ticked.add(item.entry.id);
			else this.ticked.delete(item.entry.id);
		}
		this._renderRows(set);
		this._refresh();
	}

	/** Sync the set checkboxes, the dimming and the footer with `ticked`. */
	private _refresh(): void {
		for (const [set, view] of this.views) {
			const writable = (this.plan.get(set) ?? []).filter((i) => writes(i.action));
			const on = writable.filter((i) => this.ticked.has(i.entry.id)).length;
			// Locked while confirming, so nothing changes what is being written.
			view.box.disabled = this.busy || writable.length === 0;
			view.input.disabled = this.busy;
			for (const row of view.rows.querySelectorAll<HTMLInputElement>(".sf-story-row-cb")) row.disabled = this.busy;
			view.box.checked = writable.length > 0 && on === writable.length;
			view.box.indeterminate = on > 0 && on < writable.length;
			view.card.toggleClass("is-off", writable.length > 0 && on === 0);
		}
		this._refreshFoot();
	}

	private _tickedItems(): PlanItem[] {
		const out: PlanItem[] = [];
		for (const s of SETS) for (const item of this.plan.get(s.set) ?? []) if (writes(item.action) && this.ticked.has(item.entry.id)) out.push(item);
		return out;
	}

	private _renderFoot(el: HTMLElement): void {
		const foot = el.createDiv({ cls: "sf-picker-foot sf-story-foot" });
		// PRD F2.8, answered before you ask; shown while a ticked file goes into a folder not there yet.
		this.asideEl = foot.createSpan({ cls: "sf-story-foot-aside", text: "Folders that do not exist yet are created." });
		this.cancelBtn = foot.createEl("button", { text: "Cancel", attr: { type: "button" } });
		this.cancelBtn.addEventListener("click", () => this.close());
		if (this.views.size === 0) {
			this.asideEl.hide();
			return;
		}
		this.primaryBtn = foot.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
		this.primaryBtn.addEventListener("click", () => void this._confirm());
	}

	private _refreshFoot(): void {
		const btn = this.primaryBtn;
		if (!btn) return;
		const items = this._tickedItems();
		const updates = items.filter((i) => i.action === "update").length;
		const creates = items.length - updates;
		if (items.length === 0) btn.textContent = "Nothing to set up";
		else if (updates === 0) btn.textContent = `Set up ${plural(creates, "file", "files")}`;
		else if (creates === 0) btn.textContent = `Update ${plural(updates, "file", "files")}`;
		else btn.textContent = `Set up and update ${plural(items.length, "file", "files")}`;
		btn.disabled = items.length === 0 || this.pending > 0 || this.busy;
		if (this.cancelBtn) this.cancelBtn.disabled = this.busy;
		const needsFolder = items.some((i) => i.action !== "update" && !this._folderExists(parentFolderOf(i.path)));
		this.asideEl?.toggle(needsFolder);
	}

	private _folderExists(folder: string): boolean {
		return folder === "" || this.app.vault.getAbstractFileByPath(folder) instanceof TFolder;
	}

	// ---------------------------------------------------------------------------
	// Confirm: the only path that writes
	// ---------------------------------------------------------------------------

	private async _confirm(): Promise<void> {
		// The primary button is disabled while busy, planning or with nothing ticked.
		// Everything this confirm writes and reports is fixed here, before the first await.
		const items = this._tickedItems();
		const refusals = this._refusalLines();
		this.busy = true;
		this._refresh();
		// Equal to the folders the shown plans were computed for: the button is disabled while a replan
		// is pending, and a failed replan puts its set's previous folder back.
		const folders = { ...this.folders };
		const changed = SETS.some((s) => folders[s.key] !== this.saved[s.key]);
		if (changed) {
			try {
				await this.deps.saveFolders(folders);
			} catch (err) {
				new Notice(`Could not save the folder settings: ${messageOf(err)}. Nothing was written.`);
				this.busy = false;
				this._refresh();
				return;
			}
		}
		const result = await executePlan(items, folders, { app: this.app, store: this.deps.store, pluginVersion: this.deps.pluginVersion });
		this.close();
		showResult(result, items, refusals);
	}

	/**
	 * Skipped lines from the plan (S5c): every item that writes nothing and needs you, in a set the
	 * user did not untick. Up-to-date and Already there items (R1), unticked rows and unticked sets
	 * are not listed.
	 */
	private _refusalLines(): PlanOutcome[] {
		const out: PlanOutcome[] = [];
		for (const s of SETS) {
			const items = this.plan.get(s.set) ?? [];
			const writable = items.filter((i) => writes(i.action));
			if (writable.length > 0 && !writable.some((i) => this.ticked.has(i.entry.id))) continue;
			for (const item of items) {
				const reason = this._noticeReason(item);
				if (reason !== undefined) out.push({ path: item.path, reason });
			}
		}
		return out;
	}

	private _noticeReason(item: PlanItem): string | undefined {
		switch (item.action) {
			case "skip-edited":
				return editedRefusal(item.path, "Not updated");
			case "unreadable":
				return this._readRefusal(item);
			case "refused":
				return damagedRefusal(item.path);
			default:
				return undefined;
		}
	}
}

// ---------------------------------------------------------------------------
// Result notice (S5, D10): composed in storyFilesNotice.ts, drawn here
// ---------------------------------------------------------------------------

function showResult(result: ExecutePlanResult, items: readonly PlanItem[], planSkips: readonly PlanOutcome[]): void {
	const planned = new Map<string, PlannedWrite>(
		items.map((i) => [i.path, { set: i.entry.set, update: i.action === "update", folder: folderOfRecord(i) }]),
	);
	const notice = composeNotice(result, planned, planSkips);
	for (const line of notice.debug) console.debug(line);

	// The Notice gets an empty string and its public messageEl is filled with element helpers:
	// a fragment from another window's document (after a popout) fails Obsidian's instanceof
	// check and shows as "[object DocumentFragment]". messageEl creates in its own document.
	const shown = notice.sticky ? new Notice("", 0) : new Notice("");
	const box = shown.messageEl.createDiv({ cls: "sf-story-notice", attr: { role: notice.role } });
	box.createSpan({ cls: "sf-story-notice-head", text: notice.head });
	for (const line of notice.setLines) box.createSpan({ cls: "sf-story-notice-set", text: line });
	for (const section of notice.sections) {
		box.createSpan({ cls: "sf-story-notice-head", text: section.heading });
		for (const line of section.lines) {
			box.createSpan({ cls: "sf-story-notice-line", text: line.text });
			if (line.more !== undefined) box.createSpan({ cls: "sf-story-notice-more", text: line.more });
		}
	}
	if (notice.tail !== undefined) box.createSpan({ cls: "sf-story-notice-more", text: notice.tail });
}

/** Open the "Set up story files" dialog with its dependencies (wired by T3.3). */
export function openStoryFiles(deps: StoryFilesDeps): StoryFilesModal {
	const modal = new StoryFilesModal(deps);
	modal.open();
	return modal;
}
