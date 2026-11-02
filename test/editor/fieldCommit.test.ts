/**
 * fieldCommit.test.ts — T5.4 (spec 008-codex-surface, Phase 5).
 *
 * The commit path: a control change reaches the note's frontmatter as **one
 * plain Property**, a failure restores the value the file actually holds, an
 * external edit reaches a clean control without clobbering an in-flight one,
 * and a deleted note closes the pane.
 *
 * **Two harnesses, deliberately.** The rollback tests mount the pane the way
 * `AnvilView` does (`renderFieldSections` + a `FieldCommitter` over the same
 * `valueOf`) so they can spy on `valueOf` — the discriminant that separates a
 * REAL rollback from a vacuous re-render. The pane holds no per-field state:
 * every control is rebuilt from `FieldModel` + `valueOf` on each `_render`, so
 * "fail a commit, then re-render" would show the old value whether or not any
 * rollback code exists. Asserting `valueOf` was never re-consulted is what
 * makes the restore falsifiable. Everything else drives a real `AnvilView`.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.4
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — F5 acceptance criteria
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Error Handling
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	Notice,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	type TFile,
} from "obsidian";
import { AnvilView } from "anvil/AnvilView";
import { FieldCommitter, SPEC_TYPE, specFor } from "editor/fieldCommit";
import { renderFieldSections } from "editor/editorPane";
import type { FieldValue } from "editor/fieldControls";
import { buildFieldModel, type FieldModel } from "editor/fieldModel";
import { createMediaSeams } from "editor/mediaPicker";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import { createFileClassCache } from "fileclass/fileClassVault";
import { DEFAULT_FILE_CLASSES_FOLDER } from "types/index";
import type { FieldType, FileClassLookup } from "fileclass/fileClassTypes";
import { commit, type FieldSpec } from "inspector/frontmatterWriter";

// ---------------------------------------------------------------------------
// Fixture — one FileClass, one note, the shapes S102 draws
// ---------------------------------------------------------------------------

function fcField(id: string, name: string, type: string, values?: string[]): Record<string, unknown> {
	const def: Record<string, unknown> = { id, name, type };
	if (values) {
		def["options"] = { valuesList: Object.fromEntries(values.map((v, i) => [String(i + 1), v])) };
	}
	return def;
}

const FC_CHARACTER: Record<string, unknown> = {
	fieldsOrder: ["f-name", "f-role", "f-level", "f-active", "f-allies", "f-portrait"],
	fields: [
		fcField("f-name", "name", "Input"),
		fcField("f-role", "role", "Select", ["protagonist", "supporting"]),
		fcField("f-level", "level", "Number"),
		fcField("f-active", "active", "Boolean"),
		fcField("f-allies", "allies", "MultiFile"),
		fcField("f-portrait", "portrait", "Media"),
	],
};

function seedFrontmatter(): Record<string, unknown> {
	return {
		tags: ["canon/character"],
		fileClass: "fc-character",
		name: "Mara Stoneway",
		role: "protagonist",
		level: 3,
		active: true,
		allies: [],
		portrait: "[[mara.png]]",
	};
}

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const elke = createMockTFile({ basename: "Elke Stoneway", path: "30 Canon/31 Characters/Elke Stoneway.md" });
const fcFile = createMockTFile({ basename: "fc-character", path: "00 Meta/FileClasses/fc-character.md" });

/**
 * Seed a vault where the metadata cache READS BACK the writer's own store, so a
 * committed value round-trips exactly as it does in Obsidian. An "external"
 * edit is then modelled by writing the store directly and firing `changed`.
 */
function seedVault(app: App): void {
	app.fileManager._setFrontmatter(mara.path, seedFrontmatter());
	// A SECOND editable note, not just a link target: the pane follows whichever
	// entry is inspected, so "a write to one note" and "the note on screen" have
	// to be separable to test at all.
	app.fileManager._setFrontmatter(elke.path, { ...seedFrontmatter(), name: "Elke Stoneway" });
	const byPath = new Map<string, TFile>([mara, elke, fcFile].map((f) => [f.path, f]));

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((file) => {
		if (file.path === mara.path || file.path === elke.path) {
			return createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(file.path) });
		}
		if (file.path === fcFile.path) return createMockCachedMetadata({ frontmatter: FC_CHARACTER });
		return createMockCachedMetadata({ frontmatter: {} });
	});
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, elke, fcFile]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

// ---------------------------------------------------------------------------
// Harness A — a real AnvilView with the pane open on Mara
// ---------------------------------------------------------------------------

const views: AnvilView[] = [];

async function openPane(app: App): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view: AnvilView = new AnvilView(leaf, {
		drill: (f) => { view.inspect(f); },
		editor: {
			getDock: () => "bottom",
			fileClasses: createFileClassCache(app, () => DEFAULT_FILE_CLASSES_FOLDER, () => {}),
		},
	});
	views.push(view);
	await view.onOpen();
	view.inspect(mara);
	return view;
}

function cellIn(host: HTMLElement, name: string): HTMLElement {
	const cell = host.querySelector<HTMLElement>(`[data-sf-ed-field="${name}"]`);
	if (!cell) throw new Error(`no control cell for ${name}`);
	return cell;
}

function inputIn(host: HTMLElement, name: string): HTMLInputElement {
	const el = cellIn(host, name).querySelector<HTMLInputElement>("input");
	if (!el) throw new Error(`no input for ${name}`);
	return el;
}

/**
 * Type a value and leave the box: the `input` per keystroke, then the `change`
 * a browser fires on blur or Enter. Scalar controls commit on the LATTER (user
 * ruling 2026-08-06) — typing alone must reach the file not at all.
 */
function typeInto(host: HTMLElement, name: string, value: string): void {
	const el = inputIn(host, name);
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
	el.dispatchEvent(new Event("change", { bubbles: true }));
}

function errorTextFor(host: HTMLElement, name: string): string | null {
	return host.querySelector<HTMLElement>(`[data-sf-ed-error="${name}"]`)?.textContent ?? null;
}

function click(el: Element | null | undefined): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Harness B — the pane mounted exactly as AnvilView mounts it, with a spy-able
// `valueOf` (see the file docstring for why this exists)
// ---------------------------------------------------------------------------

interface MountedPane {
	readonly host: HTMLElement;
	readonly committer: FieldCommitter;
	readonly valueOf: ReturnType<typeof vi.fn>;
}

function modelFor(frontmatter: Record<string, unknown>): FieldModel {
	const lookup: FileClassLookup = {
		getFileClassFrontmatter: (name) => (name === "fc-character" ? FC_CHARACTER : undefined),
	};
	return buildFieldModel(resolveFileClassChain("fc-character", lookup), frontmatter);
}

const mounted: HTMLElement[] = [];

function mountPane(app: App): MountedPane {
	const frontmatter = app.fileManager._getFrontmatter(mara.path);
	const model = modelFor(frontmatter);
	const host = document.createElement("div");
	document.body.appendChild(host);
	mounted.push(host);

	const valueOf = vi.fn((name: string): unknown => frontmatter[name] ?? null);
	const media = createMediaSeams(app, mara);
	const committer = new FieldCommitter({ app, file: mara, model, host, valueOf, media });
	renderFieldSections(host, model, { valueOf, onEdit: committer.onEdit, media });
	// The snapshot + the first render are setup, not behaviour under test.
	valueOf.mockClear();
	return { host, committer, valueOf };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.useFakeTimers();
	Notice._reset();
});

afterEach(async () => {
	while (views.length > 0) await views.pop()?.onClose();
	while (mounted.length > 0) mounted.pop()?.remove();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// RED 1 — one edit, one plain Property (PRD/F5 AC)
// ---------------------------------------------------------------------------

/** Everything a Property may hold: a YAML scalar, or a list of them. */
function isPlainProperty(value: unknown): boolean {
	if (value === null) return true;
	if (Array.isArray(value)) return value.every((v) => ["string", "number", "boolean"].includes(typeof v));
	return ["string", "number", "boolean"].includes(typeof value);
}

describe("the commit path — one edit writes exactly one plain Property (T5.4)", () => {
	it("calls the writer once and sets only the edited key", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const before = { ...app.fileManager._getFrontmatter(mara.path) };

		typeInto(view.contentEl, "name", "Mara Ironwright");
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledTimes(1);
		const after = app.fileManager._getFrontmatter(mara.path);
		expect(after["name"]).toBe("Mara Ironwright");
		// No sibling key invented, none dropped — the write touched one entry.
		expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
		for (const key of Object.keys(after)) {
			if (key !== "name") expect(after[key]).toEqual(before[key]);
		}
	});

	it("writes once when a typed value settles, never once per keystroke", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const box = inputIn(view.contentEl, "name");

		for (const partial of ["M", "Ma", "Mar", "Marc", "Marcu", "Marcus"]) {
			box.value = partial;
			box.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await vi.runAllTimersAsync();

		// Undo is out of scope (#17) and this phase forbids writes that are easy
		// to trigger accidentally, so nothing has reached the file yet.
		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara Stoneway");

		box.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.runAllTimersAsync();

		// One write, of the final value. Six unserialized writes could have let
		// the file settle on "Marcu".
		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledTimes(1);
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Marcus");
	});

	it("writes plain YAML values, never an object or a class instance", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		await vi.runAllTimersAsync();
		typeInto(view.contentEl, "level", "7");
		await vi.runAllTimersAsync();
		const checkbox = inputIn(view.contentEl, "active");
		checkbox.checked = false;
		checkbox.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.runAllTimersAsync();

		const after = app.fileManager._getFrontmatter(mara.path);
		expect(after["name"]).toBe("Mara Ironwright");
		expect(after["level"]).toBe(7);
		expect(after["active"]).toBe(false);
		for (const value of Object.values(after)) expect(isPlainProperty(value)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// RED 2 — the type map is total and correct (PRD/F6 AC)
// ---------------------------------------------------------------------------

/**
 * Every metadata-menu type the plugin knows, its writer spec type, and a value
 * that type's control can actually produce. Table-driven so a 15th `FieldType`
 * fails HERE as well as at the compiler (`SPEC_TYPE` is a total `Record`).
 */
const TYPE_ROWS: ReadonlyArray<readonly [FieldType, FieldSpec["type"], FieldValue]> = [
	["Input", "text", "a typed value"],
	["Boolean", "boolean", true],
	["Number", "number", 7],
	["Select", "select", "protagonist"],
	["Cycle", "select", "protagonist"],
	["Multi", "list", ["Ember Sight"]],
	["Date", "text", "2026-08-06"],
	["Datetime", "text", "2026-08-06T10:00"],
	["Time", "text", "10:00"],
	["File", "relation", "[[Elke Stoneway]]"],
	["MultiFile", "relation", ["[[Elke Stoneway]]"]],
	["Media", "relation", "[[portrait.png]]"],
	["MultiMedia", "relation", ["[[portrait.png]]"]],
	["Unknown", "text", "anything at all"],
];

describe("the type map — every field type reaches the writer (T5.4)", () => {
	it("covers exactly the declared field types, no more and no fewer", () => {
		expect(Object.keys(SPEC_TYPE).sort()).toEqual(TYPE_ROWS.map(([type]) => type).sort());
	});

	it.each(TYPE_ROWS)("maps %s to the writer's %s spec", (type, expected) => {
		expect(specFor({ name: "f", type, width: "half" }).type).toBe(expected);
	});

	it.each(TYPE_ROWS)("commits a %s value without a validation error", async (type, _expected, value) => {
		const app = new App();
		const spec = specFor({ name: "f", type, width: "half" });

		// The whole point of the map: a value the control produces must survive
		// the writer's validation. A wrong mapping is a field that silently
		// cannot be edited at all.
		expect(await commit(app, mara, "f", value, spec)).toEqual({ ok: true });
	});

	it("falls back to text for a type it does not know, rather than crashing", () => {
		expect(specFor({ name: "f", type: "Unknown", width: "half" })).toEqual({ name: "f", type: "text" });
	});

	it("carries a Select field's declared values through to the writer", () => {
		const spec = specFor({ name: "role", type: "Select", values: ["protagonist"], width: "half" });
		expect(spec).toEqual({ name: "role", type: "select", values: ["protagonist"] });
	});
});

// ---------------------------------------------------------------------------
// RED 3 / RED 4 — a failure restores AND surfaces (PRD/F5 AC, SDD/Error Handling)
// ---------------------------------------------------------------------------

describe("a failed commit restores the previous value and surfaces the reason (T5.4)", () => {
	it("restores on a VALIDATION failure, without ever reaching the vault", async () => {
		const app = new App();
		seedVault(app);
		const pane = mountPane(app);
		// The control's own state, as the user left it before committing.
		inputIn(pane.host, "level").value = "12";

		// A value the field's spec rejects. No control produces one today — which
		// is a property worth keeping, not a reason to leave the branch untested:
		// this is the seam every control reports through.
		pane.committer.onEdit({ name: "level", value: "twelve" });
		await vi.runAllTimersAsync();

		// (b) Validation blocks BEFORE the vault — nothing was written.
		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		// (a) The control shows the value the file actually holds.
		expect(inputIn(pane.host, "level").value).toBe("3");
		// The restore came from rollback, not from re-reading the note.
		expect(pane.valueOf).not.toHaveBeenCalled();
		// (c) The reason is surfaced inline AND as a Notice.
		expect(errorTextFor(pane.host, "level")).toMatch(/finite number/i);
		expect(Notice._instances).toHaveLength(1);
	});

	it("restores on a WRITE failure, after the vault rejected the write", async () => {
		const app = new App();
		seedVault(app);
		const pane = mountPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("disk is full"));

		typeInto(pane.host, "name", "Mara Ironwright");
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledTimes(1);
		expect(inputIn(pane.host, "name").value).toBe("Mara Stoneway");
		expect(pane.valueOf).not.toHaveBeenCalled();
		// The pane RESTORES the old value, so it must not claim the edit is kept.
		const expected = "Couldn't write frontmatter. The previous value was restored.";
		expect(errorTextFor(pane.host, "name")).toBe(expected);
		expect(Notice._instances.map((n) => n.message)).toEqual([expected]);
		// And the file still holds what it held.
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara Stoneway");
	});

	it("restores a relation chip row, not only a scalar box", async () => {
		const app = new App();
		seedVault(app);
		app.fileManager._setFrontmatter(mara.path, { ...seedFrontmatter(), allies: ["[[Elke Stoneway]]"] });
		const pane = mountPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("disk is full"));

		click(cellIn(pane.host, "allies").querySelector(".sf-ed-chip-x"));
		await vi.runAllTimersAsync();

		const labels = cellIn(pane.host, "allies").querySelectorAll(".sf-ed-chip-label");
		expect(Array.from(labels).map((el) => el.textContent)).toEqual(["Elke Stoneway"]);
		expect(pane.valueOf).not.toHaveBeenCalled();
	});

	it("clears a previous failure's message once the field commits successfully", async () => {
		const app = new App();
		seedVault(app);
		const pane = mountPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("disk is full"));

		typeInto(pane.host, "name", "Mara Ironwright");
		await vi.runAllTimersAsync();
		expect(errorTextFor(pane.host, "name")).not.toBeNull();

		typeInto(pane.host, "name", "Mara Ashford");
		await vi.runAllTimersAsync();

		expect(errorTextFor(pane.host, "name")).toBeNull();
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara Ashford");
	});
});

// ---------------------------------------------------------------------------
// RED 5 / RED 6 — external sync (PRD/F5 AC)
// ---------------------------------------------------------------------------

describe("external changes reach the open editor (T5.4)", () => {
	it("updates a clean control when the note changes outside the plugin", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");

		app.fileManager._setFrontmatter(mara.path, { ...seedFrontmatter(), name: "Mara Ashford" });
		app.metadataCache._trigger("changed", mara);
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ashford");
	});

	it("does NOT clobber an in-flight edit, and catches up once it settles", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		let releaseWrite = (): void => {};
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>((res) => { releaseWrite = (): void => { res(); }; }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		// An external edit lands while the user's own write is still unresolved.
		app.fileManager._setFrontmatter(mara.path, { ...seedFrontmatter(), name: "Someone Else" });
		app.metadataCache._trigger("changed", mara);
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ironwright");

		releaseWrite();
		await vi.runAllTimersAsync();

		// Last write wins (ADR-25) — the deferred reconcile runs once the commit
		// settles, so the pane is never left permanently stale either.
		expect(inputIn(view.contentEl, "name").value).toBe("Someone Else");
	});
});

// ---------------------------------------------------------------------------
// A render that is NOT the debounced reconcile, while a write is in flight
// ---------------------------------------------------------------------------

/**
 * `_reconcile`'s defer covers the debounced paths only (`active-leaf-change`,
 * `metadataCache.changed`). Every other render is **user-initiated** — a dock
 * toggle, fullscreen, a collection switch, a section collapse — and those must
 * stay immediate: a pane that ignores clicks until a write lands is worse than
 * one that briefly shows a stale value. So the render is *corrected*, not
 * delayed, and these are the tests that say so.
 *
 * The trigger is real, not contrived: a click's mousedown blurs the box, which
 * fires the `change` that starts the commit, and the click handler then renders
 * in the same tick — while the write is still unresolved.
 */
describe("a user-initiated render during an in-flight write (T5.4)", () => {
	it("keeps showing the just-typed value when the dock is toggled mid-write", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>(() => { /* never settles */ }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		// The tool the blur came from — an immediate, user-initiated render.
		click(view.contentEl.querySelector('[data-sf-ed-tool="fullscreen"]'));
		await vi.runAllTimersAsync();

		// The pane rebuilt from a metadataCache the write has not reached. Without
		// the in-flight overlay it reseeds "Mara Stoneway" and the user watches
		// their own edit revert — with no undo journal to get it back (#17).
		expect(view.contentEl.querySelector(".sf-ed--fullscreen")).not.toBeNull();
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ironwright");
	});

	it("acts on the click immediately rather than waiting for the write", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>(() => { /* never settles */ }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		click(view.contentEl.querySelector('[data-sf-ed-tool="close"]'));
		await vi.runAllTimersAsync();

		// Deferring user-initiated renders was the rejected fix: it makes "close"
		// do nothing until I/O completes.
		expect(view.contentEl.querySelector(".sf-ed")).toBeNull();
	});

	it("goes back to the file's value once the write settles", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		let releaseWrite = (): void => {};
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>((res) => { releaseWrite = (): void => { res(); }; }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		click(view.contentEl.querySelector('[data-sf-ed-tool="fullscreen"]'));
		await vi.runAllTimersAsync();
		releaseWrite();
		await vi.runAllTimersAsync();

		// The optimistic value must not outlive its write, or it becomes a second
		// source of truth that can shadow an external edit indefinitely. The stub
		// never wrote the store, so the file still says "Mara Stoneway" — and that
		// is what a render after the write must show.
		app.metadataCache._trigger("changed", mara);
		await vi.runAllTimersAsync();
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
	});

	it("keeps a DIFFERENT note's pane reconciling while another note's write is unresolved", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>(() => { /* never settles */ }),
		);

		// A write to Mara is issued and abandoned mid-flight.
		typeInto(view.contentEl, "name", "Mara Ironwright");
		// The user moves on to a different entry. Nothing clears the record of
		// Mara's write — `_onWriteIssued` only resets on a path change when the
		// user EDITS the new note, and merely inspecting it is not an edit.
		view.inspect(elke);
		await vi.runAllTimersAsync();
		expect(inputIn(view.contentEl, "name").value).toBe("Elke Stoneway");

		// An external edit to the note now on screen.
		app.fileManager._setFrontmatter(elke.path, { ...seedFrontmatter(), name: "Elke Ashford" });
		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();

		// The defer exists to protect the pane's OWN optimistic value. Mara's
		// abandoned write is not Elke's business, and deferring on it suspends the
		// hybrid reconcile (ADR-22, ADR-25) for a note nobody is writing to — the
		// display is path-scoped, so the guard has to be too.
		expect(inputIn(view.contentEl, "name").value).toBe("Elke Ashford");
	});

	it("reseeds the live pane when a write refused AFTER the pane was rebuilt", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		let rejectWrite = (): void => {};
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>((_res, rej) => { rejectWrite = (): void => { rej(new Error("disk is full")); }; }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		click(view.contentEl.querySelector('[data-sf-ed-tool="fullscreen"]'));
		await vi.runAllTimersAsync();
		rejectWrite();
		await vi.runAllTimersAsync();

		// The committer that owns this write restores into a control the rebuild
		// already detached, so its rollback cannot reach the pane the user is
		// looking at. Something has to, or the optimistic display survives a write
		// the file refused — the exact state T5.4's success criterion forbids.
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
		expect(Notice._instances).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// RED 7 — a note deleted while the editor is open (SDD/Error Handling)
// ---------------------------------------------------------------------------

describe("a note deleted while the editor is open (T5.4)", () => {
	it("closes the pane and notifies", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();

		app.metadataCache._trigger("deleted", mara, null);
		await vi.runAllTimersAsync();

		expect(view.contentEl.querySelector(".sf-ed")).toBeNull();
		expect(Notice._instances).toHaveLength(1);

		// The pane STATE was cleared, not merely its markup: a later re-render
		// must not bring it back.
		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();
		expect(view.contentEl.querySelector(".sf-ed")).toBeNull();
	});

	it("leaves the pane open when a DIFFERENT file is deleted", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		app.metadataCache._trigger("deleted", elke, null);
		await vi.runAllTimersAsync();

		expect(view.contentEl.querySelector(".sf-ed")?.getAttribute("data-sf-ed-path")).toBe(mara.path);
		expect(Notice._instances).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// RED 8 — CON-1: no write path outside frontmatterWriter
// ---------------------------------------------------------------------------

/**
 * Direct vault-write APIs. Deliberately NOT a check for the writer's own
 * `commit`/`commitMany` imports — `AnvilView` already imports those for the
 * Kanban renumber path, and that import is the CORRECT seam.
 */
const DIRECT_WRITE_APIS: ReadonlyArray<readonly [string, RegExp]> = [
	["processFrontMatter", /\.processFrontMatter\s*\(/],
	["fileManager", /\.fileManager\b/],
	["vault.modify", /\.vault\.modify\s*\(/],
	["vault.process", /\.vault\.process\s*\(/],
	["vault.create", /\.vault\.create\s*\(/],
];

/**
 * EVERY module in `src/editor`, read off the directory rather than listed: a
 * new editor module is covered the day it is added, with no one remembering to
 * extend a list. `AnvilView` is the one host outside the directory that wires
 * the commit seam.
 */
function commitSurfaceFiles(): string[] {
	const editorDir = path.resolve(__dirname, "../../src/editor");
	const editorModules = readdirSync(editorDir)
		.filter((name) => name.endsWith(".ts"))
		.map((name) => `src/editor/${name}`);
	return [...editorModules, "src/anvil/AnvilView.ts"];
}

describe("CON-1 — every write goes through frontmatterWriter (T5.4)", () => {
	it("covers every editor module, including the ones that exist today", () => {
		const files = commitSurfaceFiles();
		for (const known of ["fieldCommit", "fieldControls", "fieldModel", "editorPane", "mediaPicker"]) {
			expect(files).toContain(`src/editor/${known}.ts`);
		}
		expect(files.length).toBeGreaterThanOrEqual(7);
	});

	it.each(commitSurfaceFiles())("%s calls no vault write API of its own", (relative) => {
		const source = readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

		for (const [label, pattern] of DIRECT_WRITE_APIS) {
			expect(`${relative} uses ${label}: ${pattern.test(source)}`).toBe(`${relative} uses ${label}: false`);
		}
	});
});

// ---------------------------------------------------------------------------
// RED 9 — relations are editable: chips reach the file (PRD/F5 AC)
// ---------------------------------------------------------------------------

describe("relations are editable — the gap that motivated this spec (T5.4)", () => {
	it("writes an added chip as a [[wikilink]] a human could have typed", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		click(cellIn(view.contentEl, "allies").querySelector("[data-sf-ed-chip-add]"));
		const entry = cellIn(view.contentEl, "allies").querySelector<HTMLInputElement>("[data-sf-ed-chip-input]");
		if (!entry) throw new Error("no chip entry box");
		entry.value = "Elke Stoneway";
		entry.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["allies"]).toEqual(["[[Elke Stoneway]]"]);
	});

	it("writes the remaining list when a chip is removed", async () => {
		const app = new App();
		seedVault(app);
		app.fileManager._setFrontmatter(mara.path, {
			...seedFrontmatter(),
			allies: ["[[Elke Stoneway]]", "[[Bram Holt]]"],
		});
		const view = await openPane(app);

		click(cellIn(view.contentEl, "allies").querySelector(".sf-ed-chip-x"));
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["allies"]).toEqual(["[[Bram Holt]]"]);
	});
});

describe("a list stored in a field declared as a scalar stays a list (T6.3)", () => {
	async function paneHolding(app: App, overrides: Record<string, unknown>): Promise<AnvilView> {
		seedVault(app);
		app.fileManager._setFrontmatter(mara.path, { ...seedFrontmatter(), ...overrides });
		return openPane(app);
	}

	function addChip(host: HTMLElement, name: string, value: string): void {
		click(cellIn(host, name).querySelector("[data-sf-ed-chip-add]"));
		const entry = cellIn(host, name).querySelector<HTMLInputElement>("[data-sf-ed-chip-input]");
		if (!entry) throw new Error("no chip entry box");
		entry.value = value;
		entry.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	}

	it("shows chips, not a text box holding the joined list", async () => {
		const view = await paneHolding(new App(), { name: ["Mara", "Marie"] });

		const cell = cellIn(view.contentEl, "name");
		expect(cell.querySelectorAll(".sf-ed-chip")).toHaveLength(2);
		expect(cell.querySelector("input.sf-ed-input")).toBeNull();
	});

	it("writes a list when a chip is added to an Input field", async () => {
		const app = new App();
		const view = await paneHolding(app, { name: ["Mara"] });

		addChip(view.contentEl, "name", "Marie");
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toEqual(["Mara", "Marie"]);
	});

	it("writes a list when a chip is removed from a Select field, even the last one", async () => {
		const app = new App();
		const view = await paneHolding(app, { role: ["protagonist"] });

		click(cellIn(view.contentEl, "role").querySelector(".sf-ed-chip-x"));
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["role"]).toEqual([]);
	});

	it("keeps every link of a list stored in a Media field, as link chips", async () => {
		const app = new App();
		const view = await paneHolding(app, { portrait: ["[[a.png]]", "[[b.png]]"] });

		const links = cellIn(view.contentEl, "portrait").querySelectorAll("[data-sf-link]");
		expect(Array.from(links).map((link) => link.textContent)).toEqual(["a.png", "b.png"]);

		addChip(view.contentEl, "portrait", "c.png");
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["portrait"]).toEqual(["[[a.png]]", "[[b.png]]", "[[c.png]]"]);
	});

	it("makes a list of non-strings read-only, so no edit can rewrite it", async () => {
		const app = new App();
		const view = await paneHolding(app, { level: [1, 2] });

		const input = cellIn(view.contentEl, "level").querySelector<HTMLInputElement>("input");
		expect(input?.readOnly).toBe(true);
		expect(input?.value).toBe("[1,2]");
	});
});

// ---------------------------------------------------------------------------
// RED 10 — the wiring is live: AnvilView feeds `onEdit` (T5.4)
// ---------------------------------------------------------------------------

describe("AnvilView threads the commit seam into the pane's controls (T5.4)", () => {
	it("commits a select change made in a pane the Anvil rendered", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		const select = cellIn(view.contentEl, "role").querySelector<HTMLSelectElement>("select");
		if (!select) throw new Error("no select for role");
		select.value = "supporting";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.runAllTimersAsync();

		// Until T5.4 the Anvil passed `valueOf` alone, so this change reached
		// nothing at all — the control reported an edit into a `undefined` seam.
		expect(app.fileManager._getFrontmatter(mara.path)["role"]).toBe("supporting");
	});
});

// ---------------------------------------------------------------------------
// T5.5 — the Media control end to end: control -> FieldCommitter -> writer
// ---------------------------------------------------------------------------

describe("the Media control reaches the commit path (T5.5)", () => {
	const buttonIn = (host: HTMLElement, text: string): HTMLButtonElement => {
		const b = Array.from(cellIn(host, "portrait").querySelectorAll("button")).find((x) => x.textContent === text);
		if (!b) throw new Error(`no ${text} button`);
		return b;
	};

	it("writes an empty value to the file when Clear is pressed", async () => {
		const app = new App();
		seedVault(app);
		const pane = mountPane(app);

		click(buttonIn(pane.host, "Clear"));
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledTimes(1);
		expect(app.fileManager._getFrontmatter(mara.path)["portrait"]).toBeNull();
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara Stoneway");
	});

	it("keeps preview, path and the picker after a refused write rolls it back", async () => {
		const app = new App();
		seedVault(app);
		const pane = mountPane(app);
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("disk is full"));

		click(buttonIn(pane.host, "Clear"));
		await vi.runAllTimersAsync();

		const cell = cellIn(pane.host, "portrait");
		expect(cell.querySelector("[data-sf-ed-media-path]")?.textContent).toBe("[[mara.png]]");
		// The rebuilt control still has its picker: the seams survived the rebuild.
		expect(buttonIn(pane.host, "Choose image…")).toBeTruthy();
		expect(app.fileManager._getFrontmatter(mara.path)["portrait"]).toBe("[[mara.png]]");
	});

	it("is wired in a pane the Anvil rendered", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		const clear = Array.from(cellIn(view.contentEl, "portrait").querySelectorAll("button"))
			.find((b) => b.textContent === "Clear");
		click(clear);
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["portrait"]).toBeNull();
		expect(Array.from(cellIn(view.contentEl, "portrait").querySelectorAll("button")).map((b) => b.textContent))
			.toContain("Choose image…");
	});
});
