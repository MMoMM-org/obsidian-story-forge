/**
 * Import engine coverage (spec 008 T7.2, PRD F7 ACs 5–8): the import picker covers every engine
 * the Library shows — a vault `.base`, a Dataview query and a DataviewJS script.
 *
 * Driven end to end through the user's path: "+ Import from vault…" opens `ImportPickerModal`, the
 * user selects a file and presses Import (L11, R1), and the record lands (or does not) in a real
 * `ViewStore`. Only the consent modal is stubbed — Bases and Dataview must never reach it (R1),
 * DataviewJS always must.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, Notice, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ImportPickerModal } from "import/ImportPickerModal";
import { ViewImporter } from "import/ViewImporter";
import type { ViewDefinition } from "import/ViewDefinition";
import { ConsentGate } from "consent/ConsentGate";
import { computeChecksum } from "consent/checksum";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "store/types";

// ---------------------------------------------------------------------------
// A small vault: files by path, their contents and their frontmatter.
// ---------------------------------------------------------------------------

const ORGS_BASE = "30 Canon/Organizations/Organizations.base";
const ORGS_YAML = 'filters:\n  and:\n    - file.hasTag("canon/organization")\nviews:\n  - type: table\n    name: Organizations\n';

interface VaultFile {
	content: string;
	frontmatter?: Record<string, unknown>;
}

function viewNote(lang: "dataview" | "dataviewjs", body: string): VaultFile {
	return {
		content: `---\nsf-view: true\nsf-version: 1\nsf-name: Skills\n---\n\n\`\`\`${lang}\n${body}\`\`\`\n`,
		frontmatter: { "sf-view": true, "sf-version": 1, "sf-name": "Skills" },
	};
}

function makeVault(files: Record<string, VaultFile>) {
	const app = new App();
	const tfiles = new Map<string, TFile>();
	for (const path of Object.keys(files)) {
		const name = path.split("/").pop()!;
		const extension = name.split(".").pop()!;
		tfiles.set(path, createMockTFile({ path, name, basename: name.slice(0, -(extension.length + 1)), extension }));
	}
	const all = [...tfiles.values()];
	vi.mocked(app.vault.getFiles).mockImplementation(() => all);
	vi.mocked(app.vault.getMarkdownFiles).mockImplementation(() => all.filter((f) => f.extension === "md"));
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => tfiles.get(p) ?? null);
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => tfiles.get(p) ?? null);
	const read = async (f: TFile): Promise<string> => files[f.path]!.content;
	vi.mocked(app.vault.read).mockImplementation(read);
	vi.mocked(app.vault.cachedRead).mockImplementation(read);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
		const fm = files[f.path]?.frontmatter;
		return fm ? { frontmatter: fm } : null;
	});
	return { app, files };
}

/** A real ViewStore over a port whose saves are counted. */
function makeStore() {
	let data: StoryForgeData = { views: {} };
	const save = vi.fn(async (d: unknown) => { data = structuredClone(d as StoryForgeData); });
	const port: PluginDataPort = { load: async () => structuredClone(data), save };
	return { store: new ViewStore(port), save, views: (): Record<string, ViewRecord> => data.views ?? {} };
}

/** The consent modal, stubbed: `answer` is what the user does in it. */
function makeConsent(answer: { version: number; checksum: string } | null) {
	return { requestConsentForDef: vi.fn(async (_def: ViewDefinition) => answer) };
}

/** Open the picker and select the row named `rowName` (L11: nothing is selected on open). */
async function pick(app: App, importer: ViewImporter, consent: ReturnType<typeof makeConsent>, rowName: string): Promise<HTMLElement> {
	const modal = new ImportPickerModal(app, importer, consent as unknown as ConsentGate);
	modal.open();
	const row = await vi.waitFor(() => {
		const found = [...modal.contentEl.querySelectorAll<HTMLElement>(".sf-catalog-row")].find(
			(r) => r.querySelector(".sf-catalog-name")?.textContent === rowName,
		);
		if (!found) throw new Error(`row ${rowName} not listed`);
		return found;
	});
	row.click();
	return modal.contentEl;
}

/** Select the row and press its one action (Import, or Review and import… for DataviewJS). */
async function pickAndConfirm(app: App, importer: ViewImporter, consent: ReturnType<typeof makeConsent>, rowName: string): Promise<HTMLElement> {
	const el = await pick(app, importer, consent, rowName);
	el.querySelector<HTMLButtonElement>(".sf-catalog-act button")!.click();
	return el;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	document.body.innerHTML = "";
	Notice._reset();
});

// ---------------------------------------------------------------------------
// (a) a vault .base imports and becomes a Collection
// ---------------------------------------------------------------------------

describe("importing a .base from the vault", () => {
	it("lists the .base in the picker and, on Import, stores it as an imported Bases collection for the Anvil", async () => {
		const { app } = makeVault({ [ORGS_BASE]: { content: ORGS_YAML } });
		const { store, views } = makeStore();
		const consent = makeConsent(null);
		const el = await pickAndConfirm(app, new ViewImporter(app, store), consent, "Organizations");
		expect(el.parentElement?.querySelector(".modal-title")?.textContent).toBe("Import a collection");

		const record = await vi.waitFor(() => {
			const r = Object.values(views())[0];
			if (!r) throw new Error("nothing stored yet");
			return r;
		});
		expect(record).toMatchObject({
			kind: "collection",
			provenance: "imported",
			engine: "bases",
			source: ORGS_BASE,
			commandName: "Organizations",
			enabled: true,
			surfaces: { anvil: true, workbench: false },
		});
		// A .base is declarative: no consent modal on import (PRD F7 AC 8).
		expect(consent.requestConsentForDef).not.toHaveBeenCalled();
	});

	it("does not list a .base that is already a collection", async () => {
		const { app } = makeVault({ [ORGS_BASE]: { content: ORGS_YAML } });
		const { store } = makeStore();
		const importer = new ViewImporter(app, store);
		await importer.importToStore(await importer.parse(app.vault.getFileByPath(ORGS_BASE)!));
		expect(await importer.scanVault()).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// (b) an import that cannot be parsed or resolved is refused with a reason, nothing persisted
// ---------------------------------------------------------------------------

describe("an import whose query cannot be parsed", () => {
	it.each([
		["unparsable YAML", "views: [unclosed\n", /could not be read/],
		["YAML that is not a Bases file", "title: Organizations\n", /not a valid Bases file.*views, filters, or formulas/],
	])("refuses a .base with %s, shows the reason in the picker, and writes nothing", async (_label, yaml, reason) => {
		const { app } = makeVault({ [ORGS_BASE]: { content: yaml } });
		const { store, save } = makeStore();
		const consent = makeConsent(null);
		// R2: the reason shows as soon as the file is selected; there is no button to press.
		const el = await pick(app, new ViewImporter(app, store), consent, "Organizations");

		const error = el.querySelector(".sf-picker-feedback .sf-catalog-feedback-text");
		expect(error?.textContent).toMatch(reason);
		expect(el.querySelector(".sf-catalog-act button")).toBeNull();
		await settle();
		expect(save).not.toHaveBeenCalled();
		expect(consent.requestConsentForDef).not.toHaveBeenCalled();
	});

	// A3: the fix line is chosen by a distinct `detail`, never by matching the message text.
	it.each([
		["unparsable YAML", "views: [unclosed\n", "base-unreadable"],
		["YAML that is not a Bases file", "title: Organizations\n", "base-invalid"],
	])("names a .base refusal with %s by its detail (%s)", async (_label, yaml, detail) => {
		const { app } = makeVault({ [ORGS_BASE]: { content: yaml } });
		const importer = new ViewImporter(app, makeStore().store);
		await expect(importer.parse(app.vault.getFileByPath(ORGS_BASE)!)).rejects.toMatchObject({ code: "INVALID_BASE", detail });
	});

	it("names a .base that disappeared by its detail (base-not-found)", async () => {
		const { app } = makeVault({ [ORGS_BASE]: { content: ORGS_YAML } });
		const file = app.vault.getFileByPath(ORGS_BASE)!;
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		vi.mocked(app.vault.getFileByPath).mockReturnValue(null);
		await expect(new ViewImporter(app, makeStore().store).parse(file))
			.rejects.toMatchObject({ code: "INVALID_BASE", detail: "base-not-found", message: "This .base file could not be found" });
	});

	it("refuses a Dataview note with two query blocks, saying so in collection terms", async () => {
		const note = viewNote("dataview", "LIST\n");
		note.content += "\n```dataview\nTABLE file.name\n```\n";
		const { app } = makeVault({ "90 Views/Skills.md": note });
		const { store, save } = makeStore();
		const el = await pick(app, new ViewImporter(app, store), makeConsent(null), "Skills");
		expect(el.querySelector(".sf-picker-feedback .sf-catalog-feedback-text")?.textContent)
			.toBe("A collection must contain exactly one query block");
		await settle();
		expect(save).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// (c) a Dataview query still imports
// ---------------------------------------------------------------------------

describe("importing a Dataview query", () => {
	it("stores a DQL note as an imported Dataview collection for the Workbench, with no disclosure (R1)", async () => {
		const { app } = makeVault({ "90 Views/Skills.md": viewNote("dataview", "LIST FROM #canon/skill\n") });
		const { store, views } = makeStore();
		// The tokens ConsentGate itself computes for this note: its sf-version and its block's checksum.
		const tokens = { version: 1, checksum: await computeChecksum("LIST FROM #canon/skill\n") };
		const consent = makeConsent(null);
		await pickAndConfirm(app, new ViewImporter(app, store), consent, "Skills");
		const record = await vi.waitFor(() => {
			const r = Object.values(views())[0];
			if (!r) throw new Error("nothing stored yet");
			return r;
		});
		expect(record).toMatchObject({
			kind: "collection", provenance: "imported", engine: "dataview-dql", source: "90 Views/Skills.md",
			okayed: tokens, enabled: true, surfaces: { anvil: false, workbench: true },
		});
		expect(consent.requestConsentForDef).not.toHaveBeenCalled();
	});

	it("an imported DQL note draws with no consent modal (its tokens are the gate's own)", async () => {
		const { app } = makeVault({ "90 Views/Skills.md": viewNote("dataview", "LIST FROM #canon/skill\n") });
		const { store, views } = makeStore();
		await pickAndConfirm(app, new ViewImporter(app, store), makeConsent(null), "Skills");
		const record = await vi.waitFor(() => {
			const r = Object.values(views())[0];
			if (!r) throw new Error("nothing stored yet");
			return r;
		});
		const gate = new ConsentGate(
			app, { get: () => ({}) }, { isDvJsEnabled: () => true }, store, async () => null, () => ({ tag: "", excludedFolders: [] }),
		);
		expect((await gate.evaluate(record)).status).toBe("consented");
	});
});

// ---------------------------------------------------------------------------
// (f) DataviewJS keeps the full consent gate; Bases and DQL stay enable/disable
// ---------------------------------------------------------------------------

describe("consent by engine", () => {
	it("a DataviewJS import goes through the consent modal, and declining it persists nothing", async () => {
		const { app } = makeVault({ "90 Views/Skills.md": viewNote("dataviewjs", "dv.list([])\n") });
		const { store, save } = makeStore();
		const consent = makeConsent(null);
		const el = await pickAndConfirm(app, new ViewImporter(app, store), consent, "Skills");
		await vi.waitFor(() => expect(consent.requestConsentForDef).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(el.querySelector(".sf-picker-feedback")?.textContent)
			.toBe("Not imported. You closed the review, so nothing was saved."));
		expect(vi.mocked(consent.requestConsentForDef).mock.calls[0]![0]).toMatchObject({ engine: "dataviewjs" });
		await settle();
		expect(save).not.toHaveBeenCalled();
	});

	it("an imported .base stays drawable after the user edits it in Bases — no re-consent", async () => {
		const { app, files } = makeVault({ [ORGS_BASE]: { content: ORGS_YAML } });
		const { store, views } = makeStore();
		const importer = new ViewImporter(app, store);
		await pickAndConfirm(app, importer, makeConsent(null), "Organizations");
		const record = await vi.waitFor(() => {
			const r = Object.values(views())[0];
			if (!r) throw new Error("nothing stored yet");
			return r;
		});
		const gate = new ConsentGate(
			app, { get: () => ({}) }, { isDvJsEnabled: () => true }, store, async () => null, () => ({ tag: "", excludedFolders: [] }),
		);
		expect((await gate.evaluate(record)).status).toBe("consented");

		// L3b: "What it shows is decided by the file: edit it in Bases."
		files[ORGS_BASE]!.content = ORGS_YAML.replace("name: Organizations", "name: Guilds");
		expect((await gate.evaluate(record)).status).toBe("consented");
		// Disabling is the only switch it has.
		expect((await gate.evaluate({ ...record, enabled: false })).status).toBe("disabled");
	});
});
