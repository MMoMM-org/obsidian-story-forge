/**
 * Shared test fixtures for view-layer tests.
 *
 * Centralises makeDummyViewRecord so a ViewRecord shape change updates
 * a single place rather than every test file that needs the engine-missing
 * harness path.
 */
import type { ViewRecord } from "store/types";
import type { GetCurrentSourceChecksum, GetCurrentParams } from "consent/ConsentGate";

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
 * Inert `ConsentGate` seams (T3.4's `getCurrentSourceChecksum` /
 * `getCurrentParams`, now required constructor args) for tests that never
 * construct a `record.generated` fixture — the generated-collection branch
 * is never reached, so these two values cannot affect the outcome. Spread as
 * the trailing two constructor args:
 * `new ConsentGate(app, registry, dvSettings, store, ...inertConsentGateSeams())`.
 */
export function inertConsentGateSeams(): [GetCurrentSourceChecksum, GetCurrentParams] {
	return [async () => null, () => ({ tag: "", excludedFolders: [] })];
}
