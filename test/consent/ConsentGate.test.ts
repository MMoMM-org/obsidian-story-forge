/**
 * Tests for ConsentGate.evaluate() — the consent-state decision tree.
 *
 * Decision order (SDD/T1.3, exact):
 *   disabled → platform-restricted → engine-missing → dvjs-off →
 *   not-consented (null okayed OR missing source) → drift (version|checksum|both) → consented
 *
 * T1.3 note: requestConsent / requestReConsent are stubs returning false.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile } from "obsidian";
import { ConsentGate } from "consent/ConsentGate";
import type { EngineRegistryLike, DvSettingsReader } from "consent/ConsentGate";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import { computeChecksum } from "consent/checksum";

// ---------------------------------------------------------------------------
// Platform mock — reset per-test
// ---------------------------------------------------------------------------

vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	return {
		...actual,
		Platform: {
			isMobile: false,
			isDesktop: true,
		},
	};
});

import { Platform } from "obsidian";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: null,
		source: "views/my-view.md",
		engine: "dataviewjs",
		command: false,
		...overrides,
	};
}

function makeRegistry(
	wiredKinds: ViewRecord["engine"][] = ["dataview-dql", "dataviewjs"],
): EngineRegistryLike {
	return {
		get: vi.fn((kind: ViewRecord["engine"]) =>
			wiredKinds.includes(kind) ? {} : undefined,
		),
	};
}

function makeDvSettings(dvJsEnabled: boolean): DvSettingsReader {
	return { isDvJsEnabled: vi.fn(() => dvJsEnabled) };
}

function makeStore(): ViewStore {
	return {
		getViews: vi.fn(async () => ({})),
		setRecord: vi.fn(async () => {}),
		deleteRecord: vi.fn(async () => {}),
	} as unknown as ViewStore;
}

/**
 * Build an App mock where vault.getAbstractFileByPath returns a TFile for
 * `existingPath` (or null when existingPath is null), and vault.read returns
 * `content`. Also wires metadataCache.getFileCache to return a cache with
 * optional sf-version frontmatter.
 */
function makeAppSync(
	existingPath: string | null,
	content: string,
	sfVersion?: number,
): App {
	const app = new App();
	if (existingPath !== null) {
		const file = new TFile();
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === existingPath ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(content);
		const fm: Record<string, unknown> = {};
		if (sfVersion !== undefined) fm["sf-version"] = sfVersion;
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: fm,
		});
	} else {
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
	}
	return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DV_JS_BODY = "dv.list(dv.pages())\n";
const DV_JS_CONTENT = "# View\n\n```dataviewjs\n" + DV_JS_BODY + "```\n";

const DQL_BODY = "LIST FROM #canon\n";
const DQL_CONTENT = "# View\n\n```dataview\n" + DQL_BODY + "```\n";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConsentGate.evaluate()", () => {
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		(Platform as { isMobile: boolean }).isMobile = false;
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
		store = makeStore();
	});

	// 1. disabled -------------------------------------------------------

	it("returns {status:'disabled'} when record.enabled === false", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ enabled: false }));
		expect(result).toEqual({ status: "disabled" });
	});

	it("returns {status:'disabled'} even when okayed is set (kill-switch)", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({ enabled: false, okayed: { version: 1, checksum: "sha256:abc" } }),
		);
		expect(result).toEqual({ status: "disabled" });
	});

	// 2. platform-restricted --------------------------------------------

	it("returns {status:'platform-restricted'} for dataviewjs on mobile", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "platform-restricted" });
	});

	it("does NOT return platform-restricted for DQL on mobile", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataview-dql", okayed: null }));
		expect(result.status).not.toBe("platform-restricted");
	});

	// 3. engine-missing -------------------------------------------------

	it("returns {status:'engine-missing'} when registry.get returns undefined", async () => {
		const emptyRegistry = makeRegistry([]);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, emptyRegistry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	it("returns {status:'engine-missing'} for bases engine (unwired in M2)", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ engine: "bases" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	// 4. dvjs-off -------------------------------------------------------

	it("returns {status:'dvjs-off'} for dataviewjs when enableDataviewJs is false", async () => {
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvOff, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "dvjs-off" });
	});

	it("does NOT return dvjs-off for DQL (DQL is unaffected by the DataviewJS setting)", async () => {
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvOff, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataview-dql", okayed: null }));
		expect(result.status).not.toBe("dvjs-off");
	});

	// 5. not-consented (null okayed) ------------------------------------

	it("returns {status:'not-consented'} when okayed is null", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ okayed: null }));
		expect(result).toEqual({ status: "not-consented" });
	});

	// 6. not-consented (source missing) ---------------------------------

	it("returns {status:'not-consented'} when source note is missing", async () => {
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 1, checksum: "sha256:abc" } }),
		);
		expect(result).toEqual({ status: "not-consented" });
	});

	// 7. drift ----------------------------------------------------------

	it("returns {status:'drift', reason:'checksum'} when fresh checksum ≠ okayed.checksum", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({
				okayed: {
					version: 0,
					checksum: "sha256:" + "0".repeat(64),
				},
			}),
		);
		expect(result).toEqual({ status: "drift", reason: "checksum" });
	});

	it("returns {status:'drift', reason:'version'} when sf-version in note ≠ okayed.version", async () => {
		// Note has sf-version: 99; okayed.version = 1 → version drift
		// checksum must match the fresh block body
		const correctChecksum = await computeChecksum(DV_JS_BODY);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 99);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 1, checksum: correctChecksum } }),
		);
		expect(result).toEqual({ status: "drift", reason: "version" });
	});

	it("returns {status:'drift', reason:'both'} when both version and checksum differ", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 99);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({
				okayed: {
					version: 1,
					checksum: "sha256:" + "0".repeat(64),
				},
			}),
		);
		expect(result).toEqual({ status: "drift", reason: "both" });
	});

	// 8. consented (happy path) -----------------------------------------

	it("returns {status:'consented'} when enabled, engine wired, block present, version+checksum match", async () => {
		const correctChecksum = await computeChecksum(DV_JS_BODY);
		// No sf-version in metadata → currentVersion = 0
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 0, checksum: correctChecksum } }),
		);
		expect(result).toEqual({ status: "consented" });
	});

	it("consented path works for DQL engine", async () => {
		const correctChecksum = await computeChecksum(DQL_BODY);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(
			makeRecord({
				engine: "dataview-dql",
				okayed: { version: 0, checksum: correctChecksum },
			}),
		);
		expect(result).toEqual({ status: "consented" });
	});

	// Decision order verification ---------------------------------------

	it("checks disabled BEFORE platform-restricted (disabled wins)", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.evaluate(makeRecord({ enabled: false, engine: "dataviewjs" }));
		expect(result).toEqual({ status: "disabled" });
	});

	it("checks engine-missing BEFORE dvjs-off (engine-missing wins)", async () => {
		const emptyRegistry = makeRegistry([]);
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, emptyRegistry, dvOff, store);
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	// T1.3 stubs --------------------------------------------------------

	it("requestConsent is a stub returning false at T1.3", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.requestConsent("test-id", makeRecord({ okayed: null }));
		expect(result).toBe(false);
	});

	it("requestReConsent is a stub returning false at T1.3", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const result = await gate.requestReConsent(
			"test-id",
			makeRecord({ okayed: { version: 1, checksum: "sha256:abc" } }),
		);
		expect(result).toBe(false);
	});
});
