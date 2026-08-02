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
import type { ViewDefinition } from "import/ViewDefinition";
import { computeChecksum } from "consent/checksum";
import { DisclosureModal } from "consent/DisclosureModal";
import { inertConsentGateSeams } from "../helpers/viewFixtures";

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
		kind: "view",
		surfaces: { anvil: false, workbench: false },
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
		(Platform as { isMobile: boolean; isDesktop: boolean }).isMobile = false;
		(Platform as { isMobile: boolean; isDesktop: boolean }).isDesktop = true;
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
		store = makeStore();
	});

	// 1. disabled -------------------------------------------------------

	it("returns {status:'disabled'} when record.enabled === false", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ enabled: false }));
		expect(result).toEqual({ status: "disabled" });
	});

	it("returns {status:'disabled'} even when okayed is set (kill-switch)", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(
			makeRecord({ enabled: false, okayed: { version: 1, checksum: "sha256:abc" } }),
		);
		expect(result).toEqual({ status: "disabled" });
	});

	// 2. platform-restricted --------------------------------------------

	it("returns {status:'platform-restricted'} for dataviewjs on mobile", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "platform-restricted" });
	});

	it("does NOT return platform-restricted for DQL on mobile", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataview-dql", okayed: null }));
		expect(result.status).not.toBe("platform-restricted");
	});

	// 3. engine-missing -------------------------------------------------

	it("returns {status:'engine-missing'} when registry.get returns undefined", async () => {
		const emptyRegistry = makeRegistry([]);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, emptyRegistry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	it("returns {status:'engine-missing'} for bases engine (unwired in M2)", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "bases" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	// 4. dvjs-off -------------------------------------------------------

	it("returns {status:'dvjs-off'} for dataviewjs when enableDataviewJs is false", async () => {
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvOff, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "dvjs-off" });
	});

	it("does NOT return dvjs-off for DQL (DQL is unaffected by the DataviewJS setting)", async () => {
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvOff, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataview-dql", okayed: null }));
		expect(result.status).not.toBe("dvjs-off");
	});

	// 5. not-consented (null okayed) ------------------------------------

	it("returns {status:'not-consented'} when okayed is null", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ okayed: null }));
		expect(result).toEqual({ status: "not-consented" });
	});

	// 6. not-consented (source missing) ---------------------------------

	it("returns {status:'not-consented'} when source note is missing", async () => {
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 1, checksum: "sha256:abc" } }),
		);
		expect(result).toEqual({ status: "not-consented" });
	});

	// 7. drift ----------------------------------------------------------

	it("returns {status:'drift', reason:'checksum'} when fresh checksum ≠ okayed.checksum", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
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
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 1, checksum: correctChecksum } }),
		);
		expect(result).toEqual({ status: "drift", reason: "version" });
	});

	it("returns {status:'drift', reason:'both'} when both version and checksum differ", async () => {
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 99);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
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
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(
			makeRecord({ okayed: { version: 0, checksum: correctChecksum } }),
		);
		expect(result).toEqual({ status: "consented" });
	});

	it("consented path works for DQL engine", async () => {
		const correctChecksum = await computeChecksum(DQL_BODY);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(
			makeRecord({
				engine: "dataview-dql",
				okayed: { version: 0, checksum: correctChecksum },
			}),
		);
		expect(result).toEqual({ status: "consented" });
	});

	// Cross-platform: DQL must evaluate (incl. checksum) on mobile (C-1/C-2) -

	it("DQL on mobile reaches the checksum step and returns 'consented' WITHOUT crashing (C-2)", async () => {
		// The dataviewjs platform guard does NOT shield DQL, so a consented DQL
		// view on mobile reaches step 7 (computeChecksum). The checksum is
		// cross-platform (Web Crypto), so this must NOT throw. A desktop-only
		// node:crypto checksum would have crashed here — this test guards C-1.
		(Platform as { isMobile: boolean; isDesktop: boolean }).isMobile = true;
		(Platform as { isMobile: boolean; isDesktop: boolean }).isDesktop = false;
		const correctChecksum = await computeChecksum(DQL_BODY);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const evaluatePromise = gate.evaluate(
			makeRecord({
				engine: "dataview-dql",
				okayed: { version: 0, checksum: correctChecksum },
			}),
		);

		await expect(evaluatePromise).resolves.toEqual({ status: "consented" });
	});

	// Decision order verification ---------------------------------------

	it("checks disabled BEFORE platform-restricted (disabled wins)", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ enabled: false, engine: "dataviewjs" }));
		expect(result).toEqual({ status: "disabled" });
	});

	it("checks engine-missing BEFORE dvjs-off (engine-missing wins)", async () => {
		const emptyRegistry = makeRegistry([]);
		const dvOff = makeDvSettings(false);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT);
		const gate = new ConsentGate(app, emptyRegistry, dvOff, store, ...inertConsentGateSeams());
		const result = await gate.evaluate(makeRecord({ engine: "dataviewjs" }));
		expect(result).toEqual({ status: "engine-missing" });
	});

	// requestConsent / requestReConsent modal behaviour is tested in
	// test/consent/DisclosureModal.test.ts (T1.4).
});

// ---------------------------------------------------------------------------
// T2.1 — Bases source-model seam (ADR-5 / ADR-6)
// ---------------------------------------------------------------------------
// A "bases" ViewRecord carries raw .base YAML in record.source.
// evaluate() must NOT route it through readFencedBlock/QUERY_LANGS.
// Declarative bases records evaluate as consented without a modal.
// Fail-closed: missing/empty source → not-consented.
// engine-missing still fires when "bases" is not in the registry.
// ---------------------------------------------------------------------------

const BASES_YAML = "filter:\n  tags:\n    contains: canon\ncolumns:\n  - name\n  - alias\n";

function makeBasesRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "curated",
		enabled: true,
		okayed: null,
		source: BASES_YAML,
		engine: "bases",
		command: false,
		kind: "view",
		surfaces: { anvil: false, workbench: false },
		...overrides,
	};
}

function makeRegistryWithBases(): EngineRegistryLike {
	return {
		get: vi.fn((kind: ViewRecord["engine"]) =>
			["dataview-dql", "dataviewjs", "bases"].includes(kind) ? {} : undefined,
		),
	};
}

describe("ConsentGate.evaluate() — T2.1 bases source-model seam (ADR-5/ADR-6)", () => {
	let dvSettings: DvSettingsReader;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		(Platform as { isMobile: boolean; isDesktop: boolean }).isMobile = false;
		(Platform as { isMobile: boolean; isDesktop: boolean }).isDesktop = true;
		dvSettings = makeDvSettings(true);
		store = makeStore();
	});

	// (b) Declarative bases record evaluates consented when checksum matches — no modal

	it("returns {status:'consented'} for a bases record with matching checksum [ADR-6]", async () => {
		const registry = makeRegistryWithBases();
		// App with NO vault file matching — bases bypasses readFencedBlock entirely
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(BASES_YAML);
		const result = await gate.evaluate(
			makeBasesRecord({ okayed: { version: 0, checksum } }),
		);

		expect(result).toEqual({ status: "consented" });
	});

	// (a) Bases source read directly from record.source — vault NOT consulted

	it("does NOT call vault.getAbstractFileByPath for a bases record [ADR-5]", async () => {
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(BASES_YAML);
		await gate.evaluate(makeBasesRecord({ okayed: { version: 0, checksum } }));

		expect(app.vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	// Fail-closed: missing/empty source → not-consented

	it("returns {status:'not-consented'} when bases source is empty string [fail-closed]", async () => {
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(
			makeBasesRecord({ source: "", okayed: { version: 0, checksum: "sha256:" + "0".repeat(64) } }),
		);

		expect(result).toEqual({ status: "not-consented" });
	});

	// engine-missing still fires when bases not in registry (S46 degrade path)

	it("returns {status:'engine-missing'} for bases when registry lacks bases [engine-missing fires]", async () => {
		const registryNoBases = makeRegistry(["dataview-dql", "dataviewjs"]); // no "bases"
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registryNoBases, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(BASES_YAML);
		const result = await gate.evaluate(
			makeBasesRecord({ okayed: { version: 0, checksum } }),
		);

		expect(result).toEqual({ status: "engine-missing" });
	});

	// drift: checksum mismatch for bases → drift, not consented

	it("returns {status:'drift', reason:'checksum'} when bases YAML checksum changes [ADR-5]", async () => {
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		// okayed with wrong checksum
		const result = await gate.evaluate(
			makeBasesRecord({
				okayed: { version: 0, checksum: "sha256:" + "a".repeat(64) },
			}),
		);

		expect(result).toEqual({ status: "drift", reason: "checksum" });
	});

	// ADR-10 mobile gate: bases records on mobile → platform-restricted (before engine-check)

	it("returns {status:'platform-restricted'} for a bases record on mobile [ADR-10]", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(BASES_YAML);
		const result = await gate.evaluate(
			makeBasesRecord({ okayed: { version: 0, checksum } }),
		);

		expect(result).toEqual({ status: "platform-restricted" });
	});

	it("platform-restricted for bases fires after disabled (disabled wins) [ADR-10 order]", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(makeBasesRecord({ enabled: false }));

		expect(result).toEqual({ status: "disabled" });
	});

	it("[REGRESSION] dataview-dql on mobile is NOT platform-restricted (only bases+dataviewjs) [ADR-10]", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const registry = makeRegistry(["dataview-dql"]);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(makeRecord({ engine: "dataview-dql", okayed: null }));

		expect(result.status).not.toBe("platform-restricted");
	});

	// disabled kill-switch still fires before bases path

	it("returns {status:'disabled'} for bases record when enabled:false [kill-switch]", async () => {
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(makeBasesRecord({ enabled: false }));

		expect(result).toEqual({ status: "disabled" });
	});

	// not-consented: okayed is null → not-consented (no special bases shortcut before okayed check)

	it("returns {status:'not-consented'} when bases record has okayed:null", async () => {
		const registry = makeRegistryWithBases();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(makeBasesRecord({ okayed: null }));

		expect(result).toEqual({ status: "not-consented" });
	});

	// (d) REGRESSION GUARD: dataview-dql still evaluates exactly as before

	it("[REGRESSION] dataview-dql still requires source note (readFencedBlock path intact)", async () => {
		const registry = makeRegistry(["dataview-dql", "dataviewjs"]);
		// No file in vault → readFencedBlock returns null → not-consented (fail-closed)
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(
			makeRecord({
				engine: "dataview-dql",
				source: "views/my-view.md",
				okayed: { version: 0, checksum: "sha256:" + "0".repeat(64) },
			}),
		);

		expect(result).toEqual({ status: "not-consented" });
	});

	it("[REGRESSION] dataview-dql evaluates consented when source note exists and checksum matches", async () => {
		const registry = makeRegistry(["dataview-dql", "dataviewjs"]);
		const app = makeAppSync("views/my-view.md", DQL_CONTENT);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(DQL_BODY);
		const result = await gate.evaluate(
			makeRecord({
				engine: "dataview-dql",
				source: "views/my-view.md",
				okayed: { version: 0, checksum },
			}),
		);

		expect(result).toEqual({ status: "consented" });
	});

	it("[REGRESSION] dataviewjs still gates: missing source → not-consented (fail-closed)", async () => {
		const registry = makeRegistry(["dataview-dql", "dataviewjs"]);
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(
			makeRecord({
				engine: "dataviewjs",
				source: "views/missing.md",
				okayed: { version: 0, checksum: "sha256:" + "0".repeat(64) },
			}),
		);

		expect(result).toEqual({ status: "not-consented" });
	});
});

// ---------------------------------------------------------------------------
// Generated-collection guard — a collection record with a `generated` block
// must not be checksummed as raw YAML.
//
// A catalog-rendered collection's `source` is a vault PATH to the
// materialised .base file, not raw YAML, while `okayed.checksum` is the
// checksum of the source .base content. Without a guard,
// _evaluateBasesRecord would recompute a checksum over the path string,
// which can never equal okayed.checksum, and the record would always report
// drift instead of consented. That breaks ADR-29's "an existing install
// upgrades without visible change".
// ---------------------------------------------------------------------------

function makeGeneratedCollectionRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "curated",
		enabled: true,
		// Deliberately stale: a checksum that does not match the path-shaped
		// `source` string. The guard must ignore this rather than recompute
		// and compare against `source`.
		okayed: { version: 0, checksum: "sha256:" + "9".repeat(64) },
		source: "00 Meta/Bases/overview-characters.base",
		engine: "bases",
		command: false,
		kind: "collection",
		surfaces: { anvil: false, workbench: false },
		catalogId: "overview-characters",
		generated: {
			sourceChecksum: "sha256:" + "9".repeat(64),
			params: { tag: "canon/character", excludedFolders: ["00 Meta"] },
			instanceChecksum: "sha256:" + "1".repeat(64),
			filePath: "00 Meta/Bases/overview-characters.base",
			verify: true,
		},
		...overrides,
	};
}

/**
 * Build a generated-collection fixture with the base record's `generated`
 * block overridden. Avoids non-null assertions on `ViewRecord["generated"]`
 * (which the factory always sets) by failing loudly instead if that ever
 * stops being true.
 */
function makeGeneratedFixture(
	generatedOverrides: Partial<NonNullable<ViewRecord["generated"]>> = {},
	recordOverrides: Partial<ViewRecord> = {},
): { record: ViewRecord; generated: NonNullable<ViewRecord["generated"]> } {
	const base = makeGeneratedCollectionRecord(recordOverrides);
	const baseGenerated = base.generated;
	if (baseGenerated === undefined) {
		throw new Error("makeGeneratedCollectionRecord always sets `generated`");
	}
	const generated = { ...baseGenerated, ...generatedOverrides };
	return { record: { ...base, generated }, generated };
}

describe("ConsentGate.evaluate() — generated collection guard", () => {
	it("returns {status:'consented'} for a generated collection record, not drift", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate(makeGeneratedCollectionRecord());

		expect(result).toEqual({ status: "consented" });
	});

	it("returns {status:'not-consented'} for a never-consented record that already carries a generated block [ordering fix]", async () => {
		// The not-consented check (okayed === null) must run BEFORE the
		// generated-block short-circuit (step 5a), or a never-consented record
		// that happens to carry a `generated` block would be silently reported
		// as consented. Every other fixture in this file sets a non-null
		// `okayed`, so nothing previously pinned this ordering.
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.evaluate({ ...makeGeneratedCollectionRecord(), okayed: null });

		expect(result).toEqual({ status: "not-consented" });
	});

	it("[REGRESSION] a plain bases record (kind:'view', source = raw YAML, no generated block) still evaluates exactly as before", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const checksum = await computeChecksum(BASES_YAML);
		const consented = await gate.evaluate(
			makeBasesRecord({ okayed: { version: 0, checksum } }),
		);
		expect(consented).toEqual({ status: "consented" });

		const drifted = await gate.evaluate(
			makeBasesRecord({ okayed: { version: 0, checksum: "sha256:" + "a".repeat(64) } }),
		);
		expect(drifted).toEqual({ status: "drift", reason: "checksum" });
	});
});

// ---------------------------------------------------------------------------
// T3.4 — classify()-driven decisions for generated collections (ADR-0003)
//
// Replaces the T3.3 placeholder ("every generated collection is consented")
// with the real branch: classify() compares source checksum / params /
// on-disk file checksum, and only its "reconsent" outcome may block a render.
// ---------------------------------------------------------------------------

describe("ConsentGate.evaluate() — T3.4 classify()-driven generated collections", () => {
	it("regenerates silently when only params changed: consented, no drift, no modal constructed [SDD Edge Case]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();

		const fileContent = 'filters: file.hasTag("canon/character")\n';
		const instanceChecksum = await computeChecksum(fileContent);
		const { record, generated } = makeGeneratedFixture({ instanceChecksum });

		const app = makeAppSync(generated.filePath, fileContent);
		const presentSpy = vi.spyOn(DisclosureModal.prototype, "present");

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => generated.sourceChecksum, // upstream unchanged
			() => ({ tag: "canon/location", excludedFolders: ["00 Meta"] }), // params changed
		);

		const result = await gate.evaluate(record);

		expect(result).toEqual({ status: "consented" });
		expect(presentSpy).not.toHaveBeenCalled();
	});

	it("returns {status:'drift', reason:'checksum'} when getCurrentSourceChecksum differs from generated.sourceChecksum [upstream template changed]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const { record, generated } = makeGeneratedFixture();

		// File state is irrelevant: classify() checks the source checksum first.
		const app = makeAppSync(null, "");

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => "sha256:" + "a".repeat(64), // differs from generated.sourceChecksum
			() => generated.params,
		);

		const result = await gate.evaluate(record);

		expect(result).toEqual({ status: "drift", reason: "checksum" });
	});

	it("keeps a hand-edited file as-is: consented [ask maps to consented]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const { record, generated } = makeGeneratedFixture();

		// generated.instanceChecksum is a fixture placeholder that cannot match
		// any real content's checksum — this content is "hand-edited" by
		// construction. Source checksum and params are UNCHANGED (only the
		// fileChecksum differs), so classify() takes the "ask" branch
		// specifically — not "regenerate" (params-changed, tested above) or
		// "reconsent" (source-changed, tested below).
		const handEditedContent = 'filters: file.hasTag("someone-elses-edit")\n';
		const app = makeAppSync(generated.filePath, handEditedContent);

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => generated.sourceChecksum,
			() => generated.params,
		);

		const result = await gate.evaluate(record);

		expect(result).toEqual({ status: "consented" });
	});

	it("returns {status:'consented'} when the generated file is missing from the vault [regenerate, no prompt]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const { record, generated } = makeGeneratedFixture();
		const app = makeAppSync(null, "");

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => generated.sourceChecksum,
			() => generated.params,
		);

		const result = await gate.evaluate(record);

		expect(result).toEqual({ status: "consented" });
	});

	it("resolves {status:'consented'} instead of throwing when vault.read rejects for the generated file [degrades to null, not an unhandled rejection]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const { record, generated } = makeGeneratedFixture();

		// File EXISTS (getAbstractFileByPath resolves a TFile) but reading it
		// rejects — I/O error, binary decode failure, or a race after the
		// existence check. This must degrade to fileChecksum:null (→
		// classify()'s "regenerate" branch), not escape evaluate() as an
		// unhandled rejection.
		const app = makeAppSync(generated.filePath, "");
		vi.mocked(app.vault.read).mockRejectedValue(new Error("EISDIR: illegal operation on a directory"));

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => generated.sourceChecksum,
			() => generated.params,
		);

		await expect(gate.evaluate(record)).resolves.toEqual({ status: "consented" });
	});

	it("returns {status:'consented'} when verify:false, even when source/params/file all differ [the file is the user's now]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();
		const { record, generated } = makeGeneratedFixture({ verify: false });
		const app = makeAppSync(generated.filePath, "totally different content, hand-edited\n");

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => "sha256:" + "b".repeat(64), // differs from generated.sourceChecksum
			() => ({ tag: "a-different-tag", excludedFolders: [] }), // differs from generated.params
		);

		const result = await gate.evaluate(record);

		expect(result).toEqual({ status: "consented" });
	});

	it("does NOT report drift when getCurrentSourceChecksum cannot determine the upstream (returns null) [cannot tell, do not nag]", async () => {
		const registry = makeRegistryWithBases();
		const dvSettings = makeDvSettings(true);
		const store = makeStore();

		const fileContent = 'filters: file.hasTag("canon/character")\n';
		const instanceChecksum = await computeChecksum(fileContent);
		const { record, generated } = makeGeneratedFixture({ instanceChecksum });
		const app = makeAppSync(generated.filePath, fileContent);

		const gate = new ConsentGate(
			app,
			registry,
			dvSettings,
			store,
			async () => null, // unknown upstream — e.g. no longer in the catalog
			() => generated.params,
		);

		const result = await gate.evaluate(record);

		expect(result.status).not.toBe("drift");
		expect(result).toEqual({ status: "consented" });
	});
});

// ---------------------------------------------------------------------------
// requestConsentForDef — no-write, def-based consent path (T-S2.1)
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: "views/my-view.md",
		engine: "dataviewjs",
		version: 3,
		name: "My View",
		description: "A view",
		command: false,
		querySource: DV_JS_BODY,
		checksum: `sha256:${"0".repeat(64)}`,
		...overrides,
	};
}

describe("ConsentGate.requestConsentForDef()", () => {
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
		store = makeStore();
	});

	it("returns {version, checksum} on grant WITHOUT writing the store", async () => {
		vi.spyOn(DisclosureModal.prototype, "present").mockResolvedValue(true);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 3);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const expectedChecksum = await computeChecksum(DV_JS_BODY);
		const result = await gate.requestConsentForDef(makeDef());

		expect(result).toEqual({ version: 3, checksum: expectedChecksum });
		expect(store.setRecord).not.toHaveBeenCalled();
	});

	it("returns null when the modal is cancelled — no store write", async () => {
		vi.spyOn(DisclosureModal.prototype, "present").mockResolvedValue(false);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 3);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.requestConsentForDef(makeDef());

		expect(result).toBeNull();
		expect(store.setRecord).not.toHaveBeenCalled();
	});

	it("returns null when the source note is missing (readFencedBlock → null)", async () => {
		const presentSpy = vi.spyOn(DisclosureModal.prototype, "present");
		const app = makeAppSync(null, "");
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());

		const result = await gate.requestConsentForDef(makeDef());

		expect(result).toBeNull();
		expect(presentSpy).not.toHaveBeenCalled();
		expect(store.setRecord).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// requestConsent — write path regression (T-S2.1 refactor guard)
// ---------------------------------------------------------------------------

describe("ConsentGate.requestConsent() write path", () => {
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
		store = makeStore();
	});

	it("still writes okayed+enabled:true and returns true on grant", async () => {
		vi.spyOn(DisclosureModal.prototype, "present").mockResolvedValue(true);
		const app = makeAppSync("views/my-view.md", DV_JS_CONTENT, 7);
		const gate = new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams());
		const record = makeRecord({ okayed: null });

		const expectedChecksum = await computeChecksum(DV_JS_BODY);
		const granted = await gate.requestConsent("id-1", record);

		expect(granted).toBe(true);
		expect(store.setRecord).toHaveBeenCalledTimes(1);
		expect(store.setRecord).toHaveBeenCalledWith("id-1", {
			...record,
			enabled: true,
			okayed: { version: 7, checksum: expectedChecksum },
		});
	});
});
