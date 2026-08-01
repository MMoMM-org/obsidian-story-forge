/**
 * Shared test fixtures for view-layer tests.
 *
 * Centralises makeDummyViewRecord so a ViewRecord shape change updates
 * a single place rather than every test file that needs the engine-missing
 * harness path. Also centralises makeNoopMigrationDeps — the T3.2
 * MigrateLegacyBasesDeps double every ViewStore-constructing test file needs
 * but whose own tests are not about migration.
 */
import type { ViewRecord } from "store/types";
import type { MigrateLegacyBasesDeps } from "store/migrateLegacyBases";

/**
 * A non-null ViewRecord that routes SidebarView._renderResolved into the
 * engine-missing branch (registry returns undefined → nativeEngine.render)
 * rather than the !view branch (Inspector-only).
 *
 * Navigation + pipeline integration tests need nativeEngine to produce M3
 * section DOM; setting this on `privateView.currentRecord` before calling
 * `_renderResolved` or `_renderState` achieves that.
 */
export function makeDummyViewRecord(): ViewRecord {
	return {
		provenance: "imported" as const,
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source: "TABLE name FROM #canon/character",
		engine: "dataview-dql" as const,
		command: false,
		kind: "view" as const,
		surfaces: { anvil: false, workbench: false },
	};
}

/**
 * No-op MigrateLegacyBasesDeps double for ViewStore construction in tests
 * that are not exercising the T3.2 legacy-bases migration itself: a reader
 * that never finds a file is fine. See src/store/migrateLegacyBases.test.ts
 * for the migration behaviour, and test/store/ViewStore.test.ts for the
 * getViews()-persists-when-migrated behaviour.
 */
export function makeNoopMigrationDeps(): MigrateLegacyBasesDeps {
	return {
		readFile: async () => null,
		curatedBasesFolder: "00 Meta/Bases",
		currentParams: { tag: "", excludedFolders: [] },
	};
}
