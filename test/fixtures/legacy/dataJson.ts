/**
 * Legacy `data.json` fixtures — what the current release (0.2.0, before spec 008 Phase 3) persists.
 *
 * Captured in T3.6 from the live test vault's own file (test/StoryForge/.obsidian/plugins/
 * story-forge/data.json, before Phase 3 changed the shapes) and shared since T8.3. The two view
 * records are verbatim: their `okayed` checksums are the real ones, taken over the fenced blocks
 * of the seed vault's `sf-views/characters-in-scene.md` and `sf-views/scene-debug-dvjs.md`, so a
 * test that lays those notes into its vault sees the user's earlier approval as current.
 *
 * Deliberately untyped: these predate the now-required `kind`/`surfaces` fields and would not
 * type-check as `ViewRecord`. That mismatch is the point.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md — T3.6
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.3
 */

/** The DQL import: `sf-views/characters-in-scene.md`. */
export const LEGACY_DQL_ID = "3dc82378-37b0-4634-abf4-8469e098f091";
/** The DataviewJS import: `sf-views/scene-debug-dvjs.md`, consented before the upgrade. */
export const LEGACY_DVJS_ID = "cba82a5f-688e-4a45-a49e-8e390dde79a0";

/** Verbatim view records of the deployed data.json. */
export const LEGACY_VIEWS_RAW = {
	[LEGACY_DQL_ID]: {
		provenance: "imported",
		enabled: true,
		okayed: {
			version: 1,
			checksum: "sha256:9791c713dec20e11f1df91ce801287e55bc1cfcffee332f75dabe9a4edde7a70",
		},
		source: "sf-views/characters-in-scene.md",
		engine: "dataview-dql",
		command: false,
		commandName: "Characters in scene",
		description: "Lists all canon characters linked from the active scene note.",
	},
	[LEGACY_DVJS_ID]: {
		provenance: "imported",
		enabled: true,
		okayed: {
			version: 1,
			checksum: "sha256:d27e0f7926a8b6868ba300f2dab606d27f41f9b5d39a49307e43a1c7b66a5e70",
		},
		source: "sf-views/scene-debug-dvjs.md",
		engine: "dataviewjs",
		command: false,
		commandName: "Scene debug (DataviewJS)",
		description: "Shows the active note's name — a safe, read-only DataviewJS debug view.",
	},
};

/** Fixture A: the real deployed shape — no `settings` key at all. */
export const FIXTURE_NO_SETTINGS = { views: LEGACY_VIEWS_RAW };

/** Fixture B: an older install whose settings blob carries the deleted `exampleSetting`. */
export const FIXTURE_LEGACY_SETTINGS = {
	settings: {
		exampleSetting: "custom",
		linkClickAction: "open",
		curatedBasesFolder: "00 Meta/Bases",
	},
	views: LEGACY_VIEWS_RAW,
};

// ---------------------------------------------------------------------------
// The accepted gap (T8.3, user decision 2026-11-17): a 0.2.0 catalog `.base` install
// ---------------------------------------------------------------------------

/** Where 0.2.0's catalog install materialised `overview-characters` (its `curatedBasesFolder`). */
export const LEGACY_CATALOG_BASE_PATH = "00 Meta/Bases/overview-characters.base";
export const LEGACY_CATALOG_BASE_ID = "5b1f0c2e-9a4d-4e57-8c61-2f0d3b7a9e14";

/**
 * The record 0.2.0's `CatalogService` wrote for `overview-characters` (main:src/catalog/
 * CatalogService.ts): no `kind`, the raw `.base` YAML in `source`, `okayed` over that YAML.
 * `yaml` is the catalog file as shipped (the seed vault keeps it byte-identical).
 */
export function legacyCatalogBaseRecord(yaml: string, checksum: string): Record<string, unknown> {
	return {
		provenance: "curated",
		enabled: true,
		okayed: { version: 1, checksum },
		source: yaml,
		engine: "bases",
		command: false,
		commandName: "Characters",
		catalogId: "overview-characters",
	};
}
