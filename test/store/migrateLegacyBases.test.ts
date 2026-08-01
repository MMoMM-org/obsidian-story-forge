/**
 * migrateLegacyBases.test.ts — T3.2 silent migration of legacy `bases` records.
 *
 * Contracts under test (ADR-29):
 *   - A legacy `bases` record (kind:"view"/missing, no `generated` block)
 *     becomes kind:"collection" with `source` rewritten to a vault PATH.
 *   - generated.instanceChecksum is computed from the vault file AS IT EXISTS
 *     NOW — the deliberately accepted nuance: a pre-upgrade hand edit becomes
 *     the new baseline, and classify() must read that as "clean" (no prompt).
 *   - generated.sourceChecksum = the record's okayed.checksum (template
 *     checksum verified at install).
 *   - generated.params = the injected CURRENT CollectionParams — this is what
 *     makes classify() read "clean" right after migration (no visible change).
 *   - A record with no catalogId (pre-T4.5) migrates with an empty filePath.
 *   - A record whose vault file is missing migrates too; classify() against a
 *     live `fileChecksum: null` read then reports "regenerate".
 *   - Only engine:"bases" records migrate; other engines pass through as-is.
 *   - Already-migrated records (kind:"collection" OR a `generated` block
 *     present) are left untouched — idempotence guard.
 *   - Running migration twice changes nothing on the second pass.
 *
 * Fixtures mirror the exact shape CatalogService._installBasesEntry persists
 * today (src/catalog/CatalogService.ts:159-173): provenance "curated",
 * okayed:{version,checksum}, source:<raw YAML>, engine:"bases", kind:"view",
 * catalogId:<slug>.
 *
 * @ref SDD/ADR-29
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md T3.2
 */

import { describe, it, expect } from "vitest";
import { applyDefaults, type ViewRecord } from "../../src/store/types";
import {
	migrateLegacyBases,
	type MigrateLegacyBasesDeps,
} from "../../src/store/migrateLegacyBases";
import { classify, type CollectionParams } from "../../src/library/baseGenerator";
import { computeChecksum } from "../../src/consent/checksum";

// ---------------------------------------------------------------------------
// Fixtures — mirror CatalogService's persisted shape exactly.
// ---------------------------------------------------------------------------

const LEGACY_YAML = 'filters: file.hasTag("canon/character")\nviews:\n  - type: table\n';

async function legacyBasesFixture(
	overrides: Partial<ViewRecord> = {},
): Promise<ViewRecord> {
	const checksum = await computeChecksum(LEGACY_YAML);
	return applyDefaults({
		provenance: "curated",
		enabled: true,
		okayed: { version: 1, checksum },
		source: LEGACY_YAML,
		engine: "bases",
		command: false,
		commandName: "Characters overview",
		kind: "view",
		surfaces: { anvil: false, workbench: false },
		catalogId: "overview-characters",
		description: "All canon characters.",
		...overrides,
	});
}

const CURRENT_PARAMS: CollectionParams = {
	tag: "canon/character",
	excludedFolders: ["00 Meta"],
};

/** Reader stub: resolves a fixed map of path → content; null for anything else. */
function readerFor(files: Record<string, string>): (path: string) => Promise<string | null> {
	return async (path: string) => (path in files ? files[path]! : null);
}

function deps(
	overrides: Partial<MigrateLegacyBasesDeps> = {},
): MigrateLegacyBasesDeps {
	return {
		readFile: readerFor({}),
		curatedBasesFolder: "00 Meta/Bases",
		currentParams: CURRENT_PARAMS,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Core migration shape
// ---------------------------------------------------------------------------

describe("migrateLegacyBases — legacy bases record shape", () => {
	it("rewrites kind to 'collection'", async () => {
		const rec = await legacyBasesFixture();
		const fileContent = "filters: file.hasTag(\"canon/character\")\nviews:\n  - type: table\n";
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": fileContent }) }),
		);
		expect(views["v1"]?.kind).toBe("collection");
	});

	it("rewrites source from raw YAML to the vault path", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.source).toBe("00 Meta/Bases/overview-characters.base");
	});

	it("sets generated.sourceChecksum from the record's okayed.checksum", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.generated?.sourceChecksum).toBe(rec.okayed?.checksum);
	});

	it("sets generated.params to the injected current params", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.generated?.params).toEqual(CURRENT_PARAMS);
	});

	it("sets generated.filePath to <curatedBasesFolder>/<catalogId>.base", async () => {
		const rec = await legacyBasesFixture({ catalogId: "overview-locations" });
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-locations.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.generated?.filePath).toBe("00 Meta/Bases/overview-locations.base");
	});

	it("sets generated.verify to true", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.generated?.verify).toBe(true);
	});

	it("leaves surfaces untouched (whatever applyDefaults produced)", async () => {
		const rec = await legacyBasesFixture({ surfaces: { anvil: true, workbench: false } });
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(views["v1"]?.surfaces).toEqual({ anvil: true, workbench: false });
	});

	it("reports changed:true when a migration occurred", async () => {
		const rec = await legacyBasesFixture();
		const { changed } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(changed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The accepted nuance — instance checksum from the file AS IT EXISTS NOW
// ---------------------------------------------------------------------------

describe("migrateLegacyBases — instance checksum baseline (ADR-29 accepted nuance)", () => {
	it("computes instanceChecksum from the vault file's CURRENT content", async () => {
		const rec = await legacyBasesFixture();
		const currentFileContent = "filters: file.hasTag(\"canon/character\")\nviews:\n  - type: table\n  - type: cards\n";
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": currentFileContent }) }),
		);
		expect(views["v1"]?.generated?.instanceChecksum).toBe(
			await computeChecksum(currentFileContent),
		);
	});

	it("a pre-upgrade hand edit becomes the baseline: classify() reads 'clean', not 'ask'", async () => {
		const rec = await legacyBasesFixture();
		// The file on disk differs from what the original template would have
		// rendered — a hand edit made BEFORE this upgrade ran.
		const handEditedContent = "filters: file.hasTag(\"canon/character\")\nviews:\n  - type: cards\n";
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": handEditedContent }) }),
		);
		const generated = views["v1"]?.generated;
		expect(generated).toBeDefined();

		// Simulate a later classify() call against the SAME (still unchanged)
		// file: no prompt should appear — the hand edit is now the baseline.
		const liveFileChecksum = await computeChecksum(handEditedContent);
		const state = classify(
			generated!,
			generated!.sourceChecksum,
			generated!.params,
			liveFileChecksum,
		);
		expect(state).toBe("clean");
	});

	it("an existing install upgrades without visible change: classify() is 'clean' when nothing changed", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		const generated = views["v1"]?.generated;
		expect(generated).toBeDefined();

		const state = classify(
			generated!,
			generated!.sourceChecksum,
			generated!.params,
			await computeChecksum(LEGACY_YAML),
		);
		expect(state).toBe("clean");
	});
});

// ---------------------------------------------------------------------------
// Missing catalogId / missing vault file → regenerate
// ---------------------------------------------------------------------------

describe("migrateLegacyBases — unresolvable path and missing file", () => {
	it("a record with no catalogId migrates with an empty filePath", async () => {
		const rec = await legacyBasesFixture({ catalogId: undefined });
		const { views } = await migrateLegacyBases({ v1: rec }, deps());
		expect(views["v1"]?.kind).toBe("collection");
		expect(views["v1"]?.generated?.filePath).toBe("");
		expect(views["v1"]?.source).toBe("");
	});

	it("a record with no catalogId classifies as 'regenerate' against a live missing-file read", async () => {
		const rec = await legacyBasesFixture({ catalogId: undefined });
		const { views } = await migrateLegacyBases({ v1: rec }, deps());
		const generated = views["v1"]?.generated;
		expect(generated).toBeDefined();

		const state = classify(generated!, generated!.sourceChecksum, generated!.params, null);
		expect(state).toBe("regenerate");
	});

	it("a record whose vault file is missing (catalogId present, reader returns null) migrates too", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases({ v1: rec }, deps({ readFile: readerFor({}) }));
		expect(views["v1"]?.kind).toBe("collection");
		expect(views["v1"]?.generated?.filePath).toBe("00 Meta/Bases/overview-characters.base");
	});

	it("a record whose vault file is missing classifies as 'regenerate' against a live missing-file read", async () => {
		const rec = await legacyBasesFixture();
		const { views } = await migrateLegacyBases({ v1: rec }, deps({ readFile: readerFor({}) }));
		const generated = views["v1"]?.generated;
		expect(generated).toBeDefined();

		const state = classify(generated!, generated!.sourceChecksum, generated!.params, null);
		expect(state).toBe("regenerate");
	});
});

// ---------------------------------------------------------------------------
// Which records migrate
// ---------------------------------------------------------------------------

describe("migrateLegacyBases — which records migrate", () => {
	it("leaves dataview-dql records untouched", async () => {
		const rec = applyDefaults({
			provenance: "imported",
			enabled: true,
			okayed: null,
			source: "views/foo.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		});
		const { views, changed } = await migrateLegacyBases({ v1: rec }, deps());
		expect(views["v1"]).toEqual(rec);
		expect(changed).toBe(false);
	});

	it("leaves dataviewjs records untouched", async () => {
		const rec = applyDefaults({
			provenance: "imported",
			enabled: true,
			okayed: null,
			source: "views/bar.md",
			engine: "dataviewjs",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		});
		const { views, changed } = await migrateLegacyBases({ v1: rec }, deps());
		expect(views["v1"]).toEqual(rec);
		expect(changed).toBe(false);
	});

	it("leaves an already-migrated record (kind:'collection') untouched", async () => {
		const rec = await legacyBasesFixture();
		const already: ViewRecord = {
			...rec,
			kind: "collection",
			source: "00 Meta/Bases/overview-characters.base",
		};
		const { views, changed } = await migrateLegacyBases({ v1: already }, deps());
		expect(views["v1"]).toEqual(already);
		expect(changed).toBe(false);
	});

	it("leaves a record with a 'generated' block untouched even if kind is still 'view'", async () => {
		const rec = await legacyBasesFixture();
		const alreadyGenerated: ViewRecord = {
			...rec,
			kind: "view", // deliberately NOT flipped — guard must key on EITHER signal
			generated: {
				sourceChecksum: rec.okayed?.checksum ?? "",
				params: { tag: CURRENT_PARAMS.tag, excludedFolders: [...CURRENT_PARAMS.excludedFolders] },
				instanceChecksum: "sha256:" + "1".repeat(64),
				filePath: "00 Meta/Bases/overview-characters.base",
				verify: true,
			},
		};
		const { views, changed } = await migrateLegacyBases({ v1: alreadyGenerated }, deps());
		expect(views["v1"]).toEqual(alreadyGenerated);
		expect(changed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

describe("migrateLegacyBases — idempotence", () => {
	it("running migration twice changes nothing on the second pass", async () => {
		const rec = await legacyBasesFixture();
		const d = deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) });

		const first = await migrateLegacyBases({ v1: rec }, d);
		expect(first.changed).toBe(true);

		const second = await migrateLegacyBases(first.views, d);
		expect(second.changed).toBe(false);
		expect(second.views).toEqual(first.views);
	});

	it("a mixed set migrates only the records that need it", async () => {
		const legacy = await legacyBasesFixture();
		const dql = applyDefaults({
			provenance: "imported",
			enabled: true,
			okayed: null,
			source: "views/foo.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		});
		const { views, changed } = await migrateLegacyBases(
			{ legacy, dql },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(changed).toBe(true);
		expect(views["legacy"]?.kind).toBe("collection");
		expect(views["dql"]?.kind).toBe("view");
	});

	it("does not mutate the input record objects", async () => {
		const rec = await legacyBasesFixture();
		const snapshot = JSON.parse(JSON.stringify(rec)) as ViewRecord;
		await migrateLegacyBases(
			{ v1: rec },
			deps({ readFile: readerFor({ "00 Meta/Bases/overview-characters.base": LEGACY_YAML }) }),
		);
		expect(rec).toEqual(snapshot);
	});
});
