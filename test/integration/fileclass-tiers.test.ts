/**
 * Tier 2 and tier 3 in the running plugin (T6.4, spec 008).
 *
 * Everything here goes through the views the plugin's own `registerView`
 * factories build, over a vault whose FileClasses can change under them, because
 * the claims are about the wiring: one cache in `main.ts`, handed to both
 * surfaces, and a fresh install that still edits.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.4
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Complex Logic, tiers 2 and 3
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, createMockCachedMetadata, createMockTFile, type TFile } from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { SidebarView } from "views/SidebarView";

type Plugin = InstanceType<typeof import("main").default>;
type Fm = Record<string, unknown>;

const FOLDER = "00 Meta/FileClasses";

const mara = createMockTFile({ basename: "Mara", path: "30 Canon/31 Characters/Mara.md" });

function fileClass(fields: ReadonlyArray<readonly [string, string]>, tagNames: string[] = []): Fm {
	return {
		tagNames,
		fieldsOrder: fields.map(([name]) => `f-${name}`),
		fields: fields.map(([name, type]) => ({ id: `f-${name}`, name, type, options: {} })),
	};
}

interface World {
	readonly app: App;
	readonly plugin: Plugin;
	/** Replace or add a FileClass and tell the metadata cache, as saving one does. */
	saveClass(name: string, frontmatter: Fm): void;
	/** Remove a FileClass and tell the vault, as deleting one does. */
	deleteClass(name: string): void;
}

const pathOf = (name: string): string => `${FOLDER}/${name}.md`;

async function world(frontmatter: Fm, seed: Record<string, Fm> = {}): Promise<World> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const classes = new Map(Object.entries(seed));
	const files = new Map<string, TFile>();
	const fileOf = (name: string): TFile => {
		const file = files.get(name) ?? createMockTFile({ basename: name, path: pathOf(name) });
		files.set(name, file);
		return file;
	};
	[...classes.keys()].forEach(fileOf);
	app.fileManager._setFrontmatter(mara.path, frontmatter);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((file) => {
		if (file === mara) return createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(mara.path) });
		const declared = classes.get(file.basename);
		return declared ? createMockCachedMetadata({ frontmatter: declared }) : null;
	});
	vi.mocked(app.vault.getMarkdownFiles).mockImplementation(() => [
		...[...classes.keys()].map(fileOf),
		mara,
	]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
		if (path === mara.path) return mara;
		return [...classes.keys()].map(fileOf).find((file) => file.path === path) ?? null;
	});
	app.workspace.getActiveFile = vi.fn(() => mara);
	app.workspace.openLinkText = vi.fn(async () => {});

	const plugin = new StoryForgePlugin(app) as Plugin;
	await plugin.onload();
	return {
		app,
		plugin,
		saveClass: (name, declared): void => {
			const created = !classes.has(name);
			classes.set(name, declared);
			if (created) app.vault._trigger("create", fileOf(name));
			app.metadataCache._trigger("changed", fileOf(name));
		},
		deleteClass: (name): void => {
			const file = fileOf(name);
			classes.delete(name);
			app.vault._trigger("delete", file);
		},
	};
}

function factory<V>(plugin: Plugin, type: string): (leaf: WorkspaceLeaf) => V {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === type);
	if (!call) throw new Error(`${type} was never registered`);
	return call[1] as (leaf: WorkspaceLeaf) => V;
}

const opened: { contentEl: HTMLElement; onClose(): Promise<void> }[] = [];

afterEach(async () => {
	while (opened.length > 0) {
		const view = opened.pop();
		view?.contentEl.remove();
		await view?.onClose();
	}
});

/** The Anvil, pane open on Mara, attached so focus behaves. */
async function openAnvil(w: World): Promise<HTMLElement> {
	const leaf = new WorkspaceLeaf();
	leaf.app = w.app;
	const view = factory<AnvilView>(w.plugin, WORKSPACE_VIEW_TYPE)(leaf);
	opened.push(view);
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	view.setLayout("codex");
	view.inspect(mara);
	return view.contentEl;
}

/** The Workbench in edit mode, following Mara through its real resolve path. */
async function openWorkbench(w: World): Promise<HTMLElement> {
	const leaf = new WorkspaceLeaf();
	leaf.app = w.app;
	const view = factory<SidebarView>(w.plugin, SIDEBAR_VIEW_TYPE)(leaf);
	opened.push(view);
	(view as unknown as { _editMode: boolean })._editMode = true;
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	await vi.waitFor(() => {
		expect(view.contentEl.querySelector("[data-sf-inspector-field-label]")).not.toBeNull();
	}, { interval: 1 });
	return view.contentEl;
}

const anvilField = (el: HTMLElement, name: string): HTMLInputElement | null =>
	el.querySelector<HTMLInputElement>(`[data-sf-ed-field="${name}"] input`);

const workbenchField = (el: HTMLElement, name: string): HTMLInputElement | null =>
	el.querySelector<HTMLInputElement>(`[data-sf-inspector-input="${name}"]`);

const anvilSections = (el: HTMLElement): (string | null)[] =>
	Array.from(el.querySelectorAll(".sf-ed-sec-label")).map((label) => label.textContent);

const OWN_KEYS: Fm = { tags: ["canon/character"], name: "Mara", level: 3, awakened: true };

describe.each([
	["absent", OWN_KEYS],
	// A folder that exists and is empty reads the same; a note still naming a
	// FileClass that is not there is the case that could dead-end.
	["empty, the note naming a FileClass that is not there", { ...OWN_KEYS, fileClass: "fc-gone" }],
])("with the FileClasses folder %s", (_label, frontmatter) => {
	it("the Anvil editor shows the note's own keys, typed by value", async () => {
		const el = await openAnvil(await world(frontmatter));

		expect(anvilField(el, "name")?.value).toBe("Mara");
		expect(anvilField(el, "level")?.type).toBe("number");
		expect(anvilField(el, "level")?.value).toBe("3");
		expect(anvilField(el, "awakened")?.type).toBe("checkbox");
	});

	it("the Workbench editor shows the note's own keys, typed by value", async () => {
		const el = await openWorkbench(await world(frontmatter));

		expect(workbenchField(el, "name")?.value).toBe("Mara");
		// The Workbench's number control is a numeric text box (`InspectorController`).
		expect(workbenchField(el, "level")?.getAttribute("data-sf-field-type")).toBe("number");
		expect(workbenchField(el, "level")?.value).toBe("3");
		expect(workbenchField(el, "awakened")?.type).toBe("checkbox");
	});
});

describe("a key no FileClass declares", () => {
	const declared = { "fc-character": fileClass([["name", "Input"]], ["canon/character"]) };
	const note = { tags: ["canon/character"], name: "Mara", scratch: "keep me" };

	it("appears under Other properties in the Anvil", async () => {
		const el = await openAnvil(await world(note, declared));

		expect(anvilSections(el)).toEqual(["Character", "Other properties"]);
		const other = Array.from(el.querySelectorAll(".sf-ed-sec-label")).find((l) => l.textContent === "Other properties");
		const scratch = anvilField(el, "scratch");
		const name = anvilField(el, "name");
		if (!other || !scratch || !name) throw new Error("missing heading or control");
		expect(other.compareDocumentPosition(scratch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(other.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
		expect(scratch.value).toBe("keep me");
	});

	it("appears under Other properties in the Workbench", async () => {
		const el = await openWorkbench(await world(note, declared));

		const heading = el.querySelector(".sf-inspector-section");
		expect(heading?.textContent).toBe("Other properties");
		const row = el.querySelector('[data-sf-inspector-field-label="scratch"]')?.closest(".sf-inspector-field");
		expect(row?.previousElementSibling).toBe(heading);
		expect(workbenchField(el, "scratch")?.value).toBe("keep me");
	});
});

describe("the plugin never writes to a FileClass", () => {
	/** Every path any vault or file-manager write was aimed at, this session. */
	function writeTargets(app: App): string[] {
		const { vault, fileManager } = app;
		const byFile = [
			fileManager.processFrontMatter, vault.modify, vault.process, vault.delete,
			vault.trash, vault.modifyBinary,
		];
		const byPath = [vault.create, vault.createBinary, vault.adapter.write, vault.adapter.remove, vault.adapter.rename];
		return [
			...byFile.flatMap((fn) => vi.mocked(fn).mock.calls.map((c) => (c[0] as TFile).path)),
			...byPath.flatMap((fn) => vi.mocked(fn).mock.calls.map((c) => String(c[0]))),
		];
	}

	it("across an edit session on both surfaces, every write lands on the note", async () => {
		const w = await world(
			{ tags: ["canon/character"], name: "Mara", level: 3, scratch: "s" },
			{ "fc-character": fileClass([["name", "Input"], ["level", "Number"]], ["canon/character"]) },
		);
		const anvil = await openAnvil(w);
		const workbench = await openWorkbench(w);

		// Declared and undeclared, in the Anvil: `change` is its commit.
		for (const [name, value] of [["name", "Mara S."], ["scratch", "t"]] as const) {
			const input = anvilField(anvil, name);
			if (!input) throw new Error(`no ${name} control`);
			input.value = value;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}
		await vi.waitFor(() => {
			expect(w.app.fileManager._getFrontmatter(mara.path)["scratch"]).toBe("t");
		}, { interval: 1 });

		// And in the Workbench, where the button is.
		const level = workbenchField(workbench, "level");
		if (!level) throw new Error("no level control");
		level.value = "4";
		level.dispatchEvent(new Event("input", { bubbles: true }));
		workbench.querySelector<HTMLElement>('[data-sf-inspector-commit="level"]')?.click();
		await vi.waitFor(() => {
			expect(w.app.fileManager._getFrontmatter(mara.path)["level"]).toBe(4);
		}, { interval: 1 });

		const targets = writeTargets(w.app);
		expect(targets.length).toBeGreaterThanOrEqual(3);
		expect(targets.filter((path) => path.startsWith(`${FOLDER}/`))).toEqual([]);
		expect(new Set(targets)).toEqual(new Set([mara.path]));
	});
});

describe("one cache across the plugin", () => {
	const claimed = { "fc-character": fileClass([["name", "Input"]], ["canon/character"]) };
	const lookups = (w: World): number =>
		vi.mocked(w.app.vault.getAbstractFileByPath).mock.calls.filter(([path]) => path === pathOf("fc-character")).length;

	it("reads a FileClass once however many surfaces draw from it", async () => {
		const w = await world({ tags: ["canon/character"], name: "Mara" }, claimed);

		await openAnvil(w);
		expect(lookups(w)).toBe(1);
		await openWorkbench(w);
		expect(lookups(w)).toBe(1);
	});

	it("stops listening when the plugin unloads", async () => {
		const w = await world({ tags: ["canon/character"], name: "Mara" }, claimed);
		const live = (): number =>
			(w.app.metadataCache._eventRegistrations.get("changed")?.length ?? 0)
			+ ["create", "delete", "rename"].reduce((n, e) => n + (w.app.vault._eventRegistrations.get(e)?.length ?? 0), 0);
		// 4 from the FileClass cache + the undo journal's vault rename and delete listeners (T2.7).
		expect(live()).toBe(6);

		w.plugin._runCleanup();

		expect(live()).toBe(0);
	});
});

describe("editing a FileClass reaches what is open", () => {
	const declared = { "fc-character": fileClass([["name", "Input"]], ["canon/character"]) };
	const note = { tags: ["canon/character"], name: "Mara", guild: "Lanterns" };
	const withGuild = fileClass([["name", "Input"], ["guild", "Input"]], ["canon/character"]);

	it("moves a field out of Other properties in the Anvil", async () => {
		const w = await world(note, declared);
		const el = await openAnvil(w);
		expect(anvilSections(el)).toContain("Other properties");

		w.saveClass("fc-character", withGuild);

		await vi.waitFor(() => { expect(anvilSections(el)).toEqual(["Character"]); });
	});

	it("falls back to the note's own keys in the Anvil when the FileClass is deleted", async () => {
		const w = await world(note, declared);
		const el = await openAnvil(w);
		expect(anvilSections(el)).toContain("Character");

		w.deleteClass("fc-character");

		await vi.waitFor(() => { expect(anvilSections(el)).not.toContain("Character"); });
		expect(anvilField(el, "guild")?.value).toBe("Lanterns");
	});

	it("leaves a draft in the Anvil alone until focus leaves", async () => {
		const w = await world(note, declared);
		const el = await openAnvil(w);
		const input = anvilField(el, "guild");
		if (!input) throw new Error("no guild control");
		input.focus();
		input.value = "Lanterns and";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		w.saveClass("fc-character", withGuild);
		await new Promise((resolve) => { setTimeout(resolve, 300); });

		expect(anvilField(el, "guild")).toBe(input);
		expect(input.value).toBe("Lanterns and");
		input.blur();
		await vi.waitFor(() => { expect(anvilSections(el)).toEqual(["Character"]); });
	});

	it("moves a field out of Other properties in the Workbench", async () => {
		const w = await world(note, declared);
		const el = await openWorkbench(w);
		expect(el.querySelector(".sf-inspector-section")?.textContent).toBe("Other properties");

		w.saveClass("fc-character", withGuild);

		await vi.waitFor(() => { expect(el.querySelector(".sf-inspector-section")).toBeNull(); });
		expect(workbenchField(el, "guild")?.value).toBe("Lanterns");
	});

	it("draws a newly declared FileClass in the Workbench", async () => {
		const w = await world(note);
		const el = await openWorkbench(w);
		expect(workbenchField(el, "age")).toBeNull();

		w.saveClass("fc-character", fileClass([["age", "Number"]], ["canon/character"]));

		await vi.waitFor(() => { expect(workbenchField(el, "age")).not.toBeNull(); });
	});

	it("leaves a dirty Workbench field alone", async () => {
		const w = await world(note, declared);
		const el = await openWorkbench(w);
		const input = workbenchField(el, "name");
		if (!input) throw new Error("no name control");
		input.value = "Mara S.";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		w.saveClass("fc-character", withGuild);
		await new Promise((resolve) => { setTimeout(resolve, 300); });

		expect(workbenchField(el, "name")?.value).toBe("Mara S.");
		expect(el.querySelector(".sf-inspector-section")?.textContent).toBe("Other properties");
	});
});
