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
import type { ConsentGate } from "consent/ConsentGate";
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
