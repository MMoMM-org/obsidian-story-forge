/**
 * Phase 3 upgrade — a pre-Phase-3 data.json loads without loss
 *
 * T3.6 (phase validation): the migration half of this task was descoped and
 * reverted (`1759be7`) — no legacy `bases`-engine record exists anywhere, so
 * there is nothing to migrate FROM. What is still live and unverified end to
 * end: Phase 3 changed both persisted shapes —
 *   - T3.1 added REQUIRED `kind` and `surfaces` to `ViewRecord`
 *   - T3.5 removed `exampleSetting` from `PluginSettings` and added
 *     `fileClassesFolder`, `excludedFolders`, `editorDock`
 * A `data.json` written by the PREVIOUS release has none of the new fields
 * and may carry the removed one. It must still load without loss or crash.
 *
 * Fixture A mirrors test/StoryForge/.obsidian/plugins/story-forge/data.json
 * verbatim (no `settings` key at all — the real deployed shape). Fixture B
 * models an older install whose settings blob still carries the deleted
 * `exampleSetting`.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md §T3.6
 * @ref src/store/types.ts — ViewRecord.kind / .surfaces (ADR-29)
 * @ref src/types/index.ts — PluginSettings (T3.5)
 */

import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort } from "store/types";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Fixtures — raw pre-Phase-3 JSON shapes. Deliberately untyped: these predate
// the now-required `kind`/`surfaces` fields and would not type-check as
// `ViewRecord` — that mismatch IS the point of this test.
// ---------------------------------------------------------------------------

/** Verbatim shape of test/StoryForge/.obsidian/plugins/story-forge/data.json. */
const LEGACY_VIEWS_RAW = {
	"3dc82378-37b0-4634-abf4-8469e098f091": {
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
	"cba82a5f-688e-4a45-a49e-8e390dde79a0": {
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
const FIXTURE_NO_SETTINGS = { views: LEGACY_VIEWS_RAW };

/** Fixture B: an older install whose settings blob carries the deleted `exampleSetting`. */
const FIXTURE_LEGACY_SETTINGS = {
	settings: {
		exampleSetting: "custom",
		linkClickAction: "open",
		curatedBasesFolder: "00 Meta/Bases",
	},
	views: LEGACY_VIEWS_RAW,
};

/**
 * Fixture C: every one of the eight current `PluginSettings` fields present with a
 * non-default stored value, plus the deleted `exampleSetting`. Pins that
 * `loadSettings()` round-trips ALL declared fields (not just the two Fixture B
 * happens to set) — a normalizer that silently drops or defaults a field it doesn't
 * explicitly handle would be a worse regression than the one this suite targets.
 */
const FIXTURE_ALL_FIELDS_STORED = {
	settings: {
		exampleSetting: "custom",
		linkClickAction: "open",
		cardTitleOpensNote: false,
		curatedBasesFolder: "Custom/Bases",
		fileClassesFolder: "Custom/FileClasses",
		excludedFolders: ["Custom Excluded"],
		editorDock: "right",
		cardByCollection: { character: "table" },
		dismissedHints: ["bases-disabled"],
		keepUndoHistory: false,
		builtInCollections: { lore: { enabled: false, tag: "story/lore" } },
		disabledCards: ["table"],
		libraryMigratedCount: 2,
	},
	views: LEGACY_VIEWS_RAW,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** In-memory PluginDataPort with a save-call counter (test/store/ViewStore.test.ts pattern). */
function fakePort(initial: unknown): PluginDataPort & { saveCount: number; data: unknown } {
	let data: unknown = structuredClone(initial);
	let saveCount = 0;
	return {
		get saveCount() {
			return saveCount;
		},
		get data() {
			return data;
		},
		async load() {
			return structuredClone(data);
		},
		async save(d: unknown) {
			data = structuredClone(d);
			saveCount++;
		},
	};
}

/** Real plugin instance, wired the same way main.ts's onload() does for settings. */
async function makePlugin(): Promise<InstanceType<typeof import("main").default>> {
	const { default: StoryForgePlugin } = await import("main");
	return new StoryForgePlugin(new App());
}

// ---------------------------------------------------------------------------
// ViewStore.getViews() over both fixtures
// ---------------------------------------------------------------------------

describe.each([
	["Fixture A — no settings key (real deployed data.json)", FIXTURE_NO_SETTINGS],
	["Fixture B — legacy settings blob with deleted exampleSetting", FIXTURE_LEGACY_SETTINGS],
])("Phase 3 upgrade — a pre-Phase-3 data.json loads without loss (%s)", (_label, fixture) => {
	it("getViews() loads every legacy record without throwing or losing a field", async () => {
		const store = new ViewStore(fakePort(fixture));
		const views = await store.getViews();

		const v1 = views["3dc82378-37b0-4634-abf4-8469e098f091"];
		const v2 = views["cba82a5f-688e-4a45-a49e-8e390dde79a0"];
		expect(v1).toBeDefined();
		expect(v2).toBeDefined();

		expect(v1).toMatchObject({
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
		});
		expect(v2).toMatchObject({
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
		});
	});

	it("each record gains kind:'view' and fail-closed surfaces, with no generated block", async () => {
		const store = new ViewStore(fakePort(fixture));
		const views = await store.getViews();

		for (const id of Object.keys(LEGACY_VIEWS_RAW)) {
			const v = views[id];
			expect(v?.kind).toBe("view");
			expect(v?.surfaces).toEqual({ anvil: false, workbench: false });
			expect(v).not.toHaveProperty("generated");
		}
	});

	it("loading does NOT write — save is never called (ADR-6)", async () => {
		const port = fakePort(fixture);
		const store = new ViewStore(port);
		await store.getViews();
		expect(port.saveCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Settings load — main.ts's loadSettings(), the production normalization seam
// ---------------------------------------------------------------------------

describe("Phase 3 upgrade — settings load through main.ts's loadSettings()", () => {
	it("an absent settings key yields DEFAULT_SETTINGS", async () => {
		const plugin = await makePlugin();
		plugin.loadData.mockResolvedValue(FIXTURE_NO_SETTINGS);

		await plugin.loadSettings();

		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("a legacy settings blob keeps its stored fields, gains the three new fields at default, and drops exampleSetting", async () => {
		const plugin = await makePlugin();
		plugin.loadData.mockResolvedValue(FIXTURE_LEGACY_SETTINGS);

		await plugin.loadSettings();

		expect(plugin.settings.linkClickAction).toBe("open");
		expect(plugin.settings.curatedBasesFolder).toBe("00 Meta/Bases");
		expect(plugin.settings.excludedFolders).toEqual(["00 Meta"]);
		expect(plugin.settings.editorDock).toBe("bottom");
		expect(plugin.settings.fileClassesFolder).toBe("00 Meta/FileClasses");
		expect(plugin.settings.cardByCollection).toEqual({});
		expect(plugin.settings.dismissedHints).toEqual([]);
		expect("exampleSetting" in plugin.settings).toBe(false);
	});

	it("round-trips all twelve declared fields when every one is stored, and carries no stray key", async () => {
		const plugin = await makePlugin();
		plugin.loadData.mockResolvedValue(FIXTURE_ALL_FIELDS_STORED);

		await plugin.loadSettings();

		expect(plugin.settings).toEqual({
			linkClickAction: "open",
			cardTitleOpensNote: false,
			curatedBasesFolder: "Custom/Bases",
			fileClassesFolder: "Custom/FileClasses",
			excludedFolders: ["Custom Excluded"],
			editorDock: "right",
			cardByCollection: { character: "table" },
			dismissedHints: ["bases-disabled"],
			keepUndoHistory: false,
			builtInCollections: { lore: { enabled: false, tag: "story/lore" } },
			disabledCards: ["table"],
			libraryMigratedCount: 2,
		});
		expect(Object.keys(plugin.settings).sort()).toEqual(
			Object.keys(DEFAULT_SETTINGS).sort(),
		);
	});
});

// ---------------------------------------------------------------------------
// Settings save — main.ts's saveSettings() must not write a stray key back out
// ---------------------------------------------------------------------------

describe("Phase 3 upgrade — settings save through main.ts's saveSettings()", () => {
	it("does not persist exampleSetting after loading a legacy blob that carried it", async () => {
		const plugin = await makePlugin();
		plugin.loadData.mockResolvedValue(FIXTURE_LEGACY_SETTINGS);
		await plugin.loadSettings();

		await plugin.saveSettings();

		expect(plugin.saveData).toHaveBeenCalledTimes(1);
		const persisted = plugin.saveData.mock.calls[0]![0] as { settings?: unknown };
		expect(persisted.settings).toEqual({
			linkClickAction: "open",
			cardTitleOpensNote: true,
			curatedBasesFolder: "00 Meta/Bases",
			fileClassesFolder: "00 Meta/FileClasses",
			excludedFolders: ["00 Meta"],
			editorDock: "bottom",
			cardByCollection: {},
			dismissedHints: [],
			keepUndoHistory: true,
			builtInCollections: {},
			disabledCards: [],
			libraryMigratedCount: 0,
		});
		expect("exampleSetting" in (persisted.settings as object)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Round-trip safety — a write after loading a legacy blob must not clobber it
// ---------------------------------------------------------------------------

describe("Phase 3 upgrade — round-trip safety after loading a legacy data.json", () => {
	it("setRecord after loading a legacy blob preserves the sibling settings untouched", async () => {
		const port = fakePort(FIXTURE_LEGACY_SETTINGS);
		const store = new ViewStore(port);

		// Read first (the upgrade path) ...
		await store.getViews();
		// ... then a normal user mutation.
		await store.setRecord("new-view", {
			provenance: "curated",
			enabled: false,
			okayed: null,
			source: "sf-views/new.md",
			engine: "bases",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		});

		const written = port.data as { settings?: unknown };
		expect(written.settings).toEqual(FIXTURE_LEGACY_SETTINGS.settings);
	});
});
