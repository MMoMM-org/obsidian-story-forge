/**
 * T7.1 gate (inherited from T3.3) — a kind:"collection" record shown in the
 * Workbench renders from its vault file.
 *
 * Since T3.3 a collection record's `source` is a vault PATH (ADR-35). Engine
 * dispatch selects by `engine` alone, so this drives the REAL BasesFenceEngine
 * through SidebarView's dispatch and asserts on what reaches the ```base```
 * fence renderer: the file's YAML, never the path.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile, createMockTFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { BasesFenceEngine } from "engines/BasesFenceEngine";
import { EngineRegistry } from "engines/QueryEngine";
import type { NoteContext } from "scoping/NoteContext";
import { ConsentGate } from "consent/ConsentGate";
import { readFencedBlock } from "import/fencedBlock";
import { computeChecksum } from "consent/checksum";
import type { ViewStore } from "store/ViewStore";
import type { QueryEngine } from "engines/QueryEngine";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";

vi.mock("bases/basesFence", () => ({ renderBaseFence: vi.fn(async () => {}) }));
import { renderBaseFence } from "bases/basesFence";

const BASE_PATH = "00 Meta/Bases/creatures.base";
const BASE_YAML = "filters:\n  and:\n    - file.hasTag(\"canon/creature\")\n";

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

function makeCtx(): NoteContext {
	const f = new TFile();
	f.path = "Mara.md";
	f.basename = "Mara";
	f.extension = "md";
	return { activeFile: f, activeKind: "character", entities: [], backlinks: [], frontmatter: {}, resolvedAt: 0 };
}

function makeCollection(): ViewRecord {
	return {
		provenance: "curated",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source: BASE_PATH,
		engine: "bases",
		command: false,
		commandName: "Creatures",
		kind: "collection",
		surfaces: { anvil: false, workbench: true },
	};
}

function consentedGate(): ConsentGate {
	return { evaluate: vi.fn(async () => ({ status: "consented" })) } as unknown as ConsentGate;
}

function nativeEngine(): NativeScopingEngine {
	return { kind: "native", render: vi.fn(async () => {}), teardown: vi.fn() } as unknown as NativeScopingEngine;
}

function appWithBaseFile(): App {
	const app = new App();
	const file = createMockTFile({ path: BASE_PATH, basename: "creatures", extension: "base" });
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => (p === BASE_PATH ? file : null));
	vi.mocked(app.vault.cachedRead).mockResolvedValue(BASE_YAML);
	return app;
}

describe("SidebarView: a collection bound to the Workbench", () => {
	let view: SidebarView | null = null;
	afterEach(async () => {
		await view?.onClose();
		view = null;
		vi.mocked(renderBaseFence).mockClear();
	});

	async function renderCollection(app: App): Promise<HTMLElement> {
		const registry = new EngineRegistry([new BasesFenceEngine(app)]);
		view = new SidebarView(makeLeaf(app), registry, consentedGate(), nativeEngine());
		await view.onOpen();
		const internals = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		internals.currentRecord = makeCollection();
		const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
		await internals._renderResolved(body, makeCtx());
		return body;
	}

	it("renders the .base file's YAML and never passes the vault path to the YAML renderer", async () => {
		await renderCollection(appWithBaseFile());

		const yamlArgs = vi.mocked(renderBaseFence).mock.calls.map((c) => c[1]);
		expect(yamlArgs).toEqual([BASE_YAML]);
		expect(yamlArgs).not.toContain(BASE_PATH);
	});

	it("a missing .base file shows the existing engine error, not a fence of the path", async () => {
		const body = await renderCollection(new App());

		expect(renderBaseFence).not.toHaveBeenCalled();
		expect(body.querySelector(".sf-engine-error")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// T7.1d1 — a Dataview collection renders wherever a Dataview view rendered
// ---------------------------------------------------------------------------

const DV_NOTE = "90 Views/Skills.md";

function dvCollection(engine: "dataview-dql" | "dataviewjs", okayed: ViewRecord["okayed"]): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed,
		source: DV_NOTE,
		engine,
		command: false,
		commandName: "Skills",
		kind: "collection",
		surfaces: { anvil: false, workbench: true },
	};
}

function appWithDvNote(lang: string, body: string): App {
	const app = new App();
	const file = createMockTFile({ path: DV_NOTE, basename: "Skills", extension: "md" });
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => (p === DV_NOTE ? file : null));
	vi.mocked(app.vault.read).mockResolvedValue(`---\nsf-version: 1\n---\n\`\`\`${lang}\n${body}\n\`\`\`\n`);
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { "sf-version": 1 } });
	return app;
}

describe("SidebarView: a Dataview collection bound to the Workbench", () => {
	let view: SidebarView | null = null;
	afterEach(async () => {
		await view?.onClose();
		view = null;
		vi.mocked(renderBaseFence).mockClear();
	});

	async function renderWith(engine: "dataview-dql" | "dataviewjs", body: string, consented: boolean) {
		const app = appWithDvNote(engine === "dataviewjs" ? "dataviewjs" : "dataview", body);
		const block = await readFencedBlock(app, DV_NOTE);
		const okayed = consented ? { version: 1, checksum: await computeChecksum(block?.body ?? "") } : null;
		const dvEngine: QueryEngine = { kind: engine, render: vi.fn(async () => {}), teardown: vi.fn() };
		const registry = new EngineRegistry([dvEngine, new BasesFenceEngine(app)]);
		const gate = new ConsentGate(app, registry, { isDvJsEnabled: () => true }, {} as ViewStore, async () => null, () => ({ tag: "", excludedFolders: [] }));
		view = new SidebarView(makeLeaf(app), registry, gate, nativeEngine());
		await view.onOpen();
		const record = dvCollection(engine, okayed);
		const internals = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(el: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		internals.currentRecord = record;
		const el = view.contentEl.querySelector(".sf-body") as HTMLElement;
		await internals._renderResolved(el, makeCtx());
		return { el, dvEngine, record };
	}

	it.each([
		["dataview-dql", "TABLE name FROM #canon/skill"],
		["dataviewjs", "dv.list([])"],
	] as const)("%s: renders through its Dataview engine, once consented, and never through the Bases fence", async (engine, body) => {
		const { el, dvEngine, record } = await renderWith(engine, body, true);

		expect(dvEngine.render).toHaveBeenCalledTimes(1);
		expect(vi.mocked(dvEngine.render).mock.calls[0]?.[0]).toBe(record);
		expect(renderBaseFence).not.toHaveBeenCalled();
		expect(el.querySelector(".sf-engine-error")).toBeNull();
	});

	it("dataviewjs without consent is held at the consent card, exactly as a view was", async () => {
		const { el, dvEngine } = await renderWith("dataviewjs", "dv.list([])", false);

		expect(dvEngine.render).not.toHaveBeenCalled();
		expect(el.querySelector(".sf-consent-required")).not.toBeNull();
	});

	it("a changed script drifts to re-consent for a collection too", async () => {
		const { el, dvEngine, record } = await renderWith("dataviewjs", "dv.list([])", true);
		vi.mocked(dvEngine.render).mockClear();
		const app = (view as unknown as { app: App }).app;
		vi.mocked(app.vault.read).mockResolvedValue("---\nsf-version: 1\n---\n```dataviewjs\ndv.list([1])\n```\n");
		const internals = view as unknown as { currentRecord: ViewRecord | null; _renderResolved(el: HTMLElement, ctx: NoteContext): Promise<void> };
		internals.currentRecord = record;
		await internals._renderResolved(el, makeCtx());

		expect(dvEngine.render).not.toHaveBeenCalled();
		expect(el.querySelector(".sf-reconsent-required")).not.toBeNull();
	});
});
