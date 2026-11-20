/**
 * T3.3 – the Scope tab's "Story files" group (S1a, S1b) and the Library tab hint (S7a).
 *
 * The status and the dialog are injected (`LibraryDeps.storyFiles`), so each test controls when
 * the status resolves and what it says. Drawing either tab writes nothing: every vault mutator
 * is a spy that must stay untouched.
 *
 * @ref PRD/F2.4 (button opens the dialog), F3.1 (folder settings), F4.2 (updates with a count)
 * @ref mockups.html S1a, S1b, S7a; SDD ADR-42
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbstractInputSuggest, App } from "../__mocks__/obsidian";
import { SettingsTab, type StoryFilesTabDeps } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { StoryFilesStatus } from "../../src/artifacts/storyFilesStatus";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types/index";

afterEach(() => { document.body.innerHTML = ""; });

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function status(kind: StoryFilesStatus["kind"], line: string): StoryFilesStatus {
	return { kind, line, short: line, tone: "neutral", updates: 0, missing: 0, setUp: 0, total: 27 };
}
const NONE = status("none", "Not set up. Writes FileClasses, templates and a schema reference into the folders above, after you confirm.");
const UP = status("up-to-date", "27 story files set up and up to date.");
const UPDATES = status("actions", "3 updates available.");
/** A status read that fails (created only when read, so no rejection floats unhandled). */
const FAIL = "fail" as const;

interface Harness {
	root: HTMLElement;
	app: App;
	plugin: { settings: PluginSettings; saveSettings: ReturnType<typeof vi.fn> };
	deps: StoryFilesTabDeps & {
		getStatus: ReturnType<typeof vi.fn>;
		open: ReturnType<typeof vi.fn>;
		dismissHint: ReturnType<typeof vi.fn>;
	};
	tab: SettingsTab;
}

async function render(opts: { statuses?: Array<Promise<StoryFilesStatus> | StoryFilesStatus | typeof FAIL>; dismissed?: boolean; noDeps?: boolean } = {}): Promise<Harness> {
	const app = new App();
	const data = { views: {} };
	const store = new ViewStore({ load: vi.fn(async () => data), save: vi.fn(async () => {}) });
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.12.7" },
		settings: { ...DEFAULT_SETTINGS } as PluginSettings,
		saveSettings: vi.fn(async () => {}),
	};
	const queue = [...(opts.statuses ?? [NONE])];
	let dismissed = opts.dismissed ?? false;
	const deps = {
		getStatus: vi.fn(() => {
			const next = queue.length > 1 ? queue.shift()! : queue[0]!;
			return next === FAIL ? Promise.reject(new Error("boom")) : Promise.resolve(next);
		}),
		open: vi.fn((_onClose?: () => void) => {}),
		isHintDismissed: () => dismissed,
		dismissHint: vi.fn(() => { dismissed = true; }),
	};
	const none = { setPersistence: async () => {}, clear: async () => {} };
	const tab = new SettingsTab(
		app, plugin as never, store, {} as unknown as ConsentGate, {} as unknown as ViewImporter,
		() => {}, () => {}, none, opts.noDeps ? {} : { storyFiles: deps },
	);
	await tab.displayAsync();
	document.body.appendChild(tab.containerEl);
	return { root: tab.containerEl, app, plugin, deps, tab };
}

const panel = (root: HTMLElement, tab: string): HTMLElement =>
	root.querySelector<HTMLElement>(`[role=tabpanel][data-tab="${tab}"]`)!;
const row = (root: HTMLElement, name: string): HTMLElement =>
	root.querySelector<HTMLElement>(`[data-setting-name="${name}"]`)!;
const statusEl = (root: HTMLElement): HTMLElement =>
	row(root, "Set up story files").querySelector<HTMLElement>(".sf-story-status")!;
const hint = (root: HTMLElement): HTMLElement | null => panel(root, "library").querySelector<HTMLElement>(".sf-story-nudge");
const button = (scope: HTMLElement, label: string): HTMLButtonElement => {
	const b = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent === label);
	if (!b) throw new Error(`no button ${label}`);
	return b;
};

function expectNoVaultWrite(app: App): void {
	const v = app.vault;
	for (const fn of [v.create, v.modify, v.process, v.createFolder, v.append, v.delete, v.trash, v.rename, v.copy]) {
		expect(fn).not.toHaveBeenCalled();
	}
	expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
}

describe("S1a · Scope tab, the Story files group", () => {
	it("adds the Story files group after Vault folders, with both folder settings and the setup row", async () => {
		const { root } = await render();
		const groups = [...panel(root, "scope").querySelectorAll<HTMLElement>(".setting-group")].map((g) => [
			g.querySelector(".setting-item-heading")?.textContent?.trim(),
			[...g.querySelectorAll(".setting-items [data-setting-name]")].map((e) => e.getAttribute("data-setting-name")),
		]);
		expect(groups).toEqual([
			["Vault folders", ["FileClasses folder", "Excluded folders"]],
			["Story files", ["Templates folder", "Schema reference folder", "Set up story files"]],
		]);
	});

	it("adds the one sentence under FileClasses folder", async () => {
		const { root } = await render();
		expect(row(root, "FileClasses folder").querySelector("div:nth-child(2)")?.textContent).toBe(
			"Vault folder containing your FileClass definitions (fc-*.md). Default: 00 Meta/FileClasses. " +
				"Set up story files… writes Story Forge's FileClasses here.",
		);
	});

	it.each([
		["Templates folder", "00 Meta/Templates",
			"Where Set up story files… places the entity and scene templates. Point Obsidian's core Templates plugin at the same folder to use them. Default: 00 Meta/Templates"],
		["Schema reference folder", "00 Meta/Schema",
			"Where Set up story files… places the notes that explain each story Property and its values. Default: 00 Meta/Schema"],
	])("draws %s with its description, default and the folder suggester", async (name, value, desc) => {
		const { root } = await render();
		const r = row(root, name);
		expect(r.querySelector("div:nth-child(2)")?.textContent).toBe(desc);
		const input = r.querySelector("input")!;
		expect(input.value).toBe(value);
		expect(input.placeholder).toBe(value);
		expect(AbstractInputSuggest._byInput.get(input)).toBeDefined();
	});

	it.each([
		["Templates folder", "templatesFolder", "00 Meta/Templates"],
		["Schema reference folder", "schemaFolder", "00 Meta/Schema"],
	] as const)("%s: a change is trimmed and saved, an emptied field falls back to the default, no file is written", async (name, key, fallback) => {
		const { root, plugin, app } = await render();
		const input = row(root, name).querySelector("input")!;
		input.value = "  Story/Here  ";
		input.dispatchEvent(new Event("input"));
		await flush();
		expect(plugin.settings[key]).toBe("Story/Here");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		input.value = "   ";
		input.dispatchEvent(new Event("input"));
		await flush();
		expect(plugin.settings[key]).toBe(fallback);
		expectNoVaultWrite(app);
	});
});

describe("S1b · the status line", () => {
	it("reads Checking story files… while the status is computed, as a polite live region", async () => {
		let resolve!: (s: StoryFilesStatus) => void;
		const { root } = await render({ statuses: [new Promise((r) => { resolve = r; })] });
		const el = statusEl(root);
		expect(el.textContent).toBe("Checking story files…");
		expect(el.getAttribute("role")).toBe("status");
		expect(el.getAttribute("aria-live")).toBe("polite");
		resolve(UPDATES);
		await flush();
		expect(statusEl(root).textContent).toBe("3 updates available.");
	});

	it.each([[NONE], [UP], [UPDATES]])("shows the status line as the row's description: %#", async (s) => {
		const { root } = await render({ statuses: [s] });
		await flush();
		expect(statusEl(root).textContent).toBe(s.line);
		expect(statusEl(root).dataset["kind"]).toBe(s.kind);
	});

	it("says it could not check when the status fails", async () => {
		const { root } = await render({ statuses: [FAIL] });
		await flush();
		expect(statusEl(root).textContent).toBe("Could not check story files");
	});

	it("the button opens the dialog; after the dialog closes the status is recomputed and redrawn", async () => {
		const { root, deps } = await render({ statuses: [NONE, UP] });
		await flush();
		button(row(root, "Set up story files"), "Set up story files…").click();
		expect(deps.open).toHaveBeenCalledTimes(1);
		expect(deps.getStatus).toHaveBeenCalledTimes(1); // one read per draw, shared by the line and the hint
		const onClose = deps.open.mock.calls[0]?.[0] as () => void;
		onClose();
		expect(statusEl(root).textContent).toBe("Checking story files…");
		await flush();
		expect(deps.getStatus).toHaveBeenCalledTimes(2);
		expect(statusEl(root).textContent).toBe(UP.line);
	});

	it("without the story files wiring the button stays disabled and no hint is drawn", async () => {
		const { root } = await render({ noDeps: true });
		await flush();
		expect(button(row(root, "Set up story files"), "Set up story files…").disabled).toBe(true);
		expect(statusEl(root).textContent).toBe("Could not check story files");
		expect(hint(root)).toBeNull();
	});

	it("a slow first read that lands after a newer one is dropped", async () => {
		let resolveFirst!: (s: StoryFilesStatus) => void;
		const { root, deps } = await render({ statuses: [new Promise((r) => { resolveFirst = r; }), UP] });
		button(row(root, "Set up story files"), "Set up story files…").click();
		(deps.open.mock.calls[0]?.[0] as () => void)();
		await flush();
		expect(statusEl(root).textContent).toBe(UP.line);
		resolveFirst(NONE);
		await flush();
		expect(statusEl(root).textContent).toBe(UP.line);
		expect(hint(root)).toBeNull();
	});

	it("drawing the tab and opening the dialog write nothing", async () => {
		const { root, app, plugin } = await render();
		await flush();
		button(row(root, "Set up story files"), "Set up story files…").click();
		await flush();
		expectNoVaultWrite(app);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});
});

describe("S7a · the Library tab hint", () => {
	it("shows above Collections while nothing is set up, with the S7a wording", async () => {
		const { root } = await render({ statuses: [NONE] });
		await flush();
		const h = hint(root)!;
		expect(h).not.toBeNull();
		expect(h.getAttribute("role")).toBe("status");
		expect(h.querySelector(".sf-story-nudge-text")?.textContent).toBe(
			"Story files are not set up. Without them the editor shows no sections or option lists, and there are no templates for new scenes and entities.",
		);
		expect(h.querySelector("b, strong")?.textContent).toBe("Story files are not set up.");
		const collections = row(panel(root, "library"), "Collections");
		expect(h.compareDocumentPosition(collections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it.each([[UP], [UPDATES], [status("partial", "FileClasses set up · Templates not set up.")]])(
		"is not shown once anything is set up: %#", async (s) => {
			const { root } = await render({ statuses: [s] });
			await flush();
			expect(hint(root)).toBeNull();
		},
	);

	it("draws nothing while the status is being checked", async () => {
		const { root } = await render({ statuses: [new Promise(() => {})] });
		await flush();
		expect(hint(root)).toBeNull();
		expect(panel(root, "library").querySelector(".sf-story-nudge-slot")?.childElementCount).toBe(0);
	});

	it("draws nothing when the status cannot be read", async () => {
		const { root } = await render({ statuses: [FAIL] });
		await flush();
		expect(hint(root)).toBeNull();
	});

	it("is not shown once dismissed, even while nothing is set up", async () => {
		const { root } = await render({ dismissed: true });
		await flush();
		expect(hint(root)).toBeNull();
		expect(statusEl(root).textContent).toBe(NONE.line);
	});

	it("its button opens the dialog and writes nothing", async () => {
		const { root, deps, app, plugin } = await render();
		await flush();
		button(hint(root)!, "Set up story files…").click();
		expect(deps.open).toHaveBeenCalledTimes(1);
		expect(deps.dismissHint).not.toHaveBeenCalled();
		expectNoVaultWrite(app);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("Don't show again stores the preference and redraws without the hint", async () => {
		const { root, deps } = await render();
		await flush();
		button(hint(root)!, "Don't show again").click();
		expect(deps.dismissHint).toHaveBeenCalledTimes(1);
		expect(hint(root)).toBeNull();
	});

	it("is gone while the status is read again after the dialog closes", async () => {
		const { root, deps } = await render({ statuses: [NONE, new Promise(() => {})] });
		await flush();
		expect(hint(root)).not.toBeNull();
		button(hint(root)!, "Set up story files…").click();
		(deps.open.mock.calls[0]?.[0] as () => void)();
		expect(hint(root)).toBeNull();
		expect(panel(root, "library").querySelector(".sf-story-nudge-slot")?.childElementCount).toBe(0);
	});

	it("shares no class with the setup dialog (its styles must not bleed in)", async () => {
		const { root } = await render();
		await flush();
		const classes = new Set([hint(root)!, ...hint(root)!.querySelectorAll("*")].flatMap((el) => [...el.classList]));
		classes.add("sf-story-nudge-slot");
		const modalSource = readFileSync(resolve(__dirname, "../../src/artifacts/StoryFilesModal.ts"), "utf8");
		const shared = [...classes].filter((c) => c.startsWith("sf-story") && modalSource.includes(`"${c}"`));
		expect([...classes]).toContain("sf-story-nudge");
		expect(shared).toEqual([]);
	});

	it("disappears after the dialog closes once something is set up", async () => {
		// Draw reads NONE; after close the one re-read says UP.
		const { root, deps } = await render({ statuses: [NONE, UP] });
		await flush();
		button(hint(root)!, "Set up story files…").click();
		(deps.open.mock.calls[0]?.[0] as () => void)();
		await flush();
		expect(hint(root)).toBeNull();
		expect(statusEl(root).textContent).toBe(UP.line);
	});
});
