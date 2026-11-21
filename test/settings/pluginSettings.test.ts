/**
 * pluginSettings.test.ts — T3.5 (spec 008-codex-surface, Phase 3)
 *
 * Covers the three new PluginSettings fields (fileClassesFolder, excludedFolders,
 * editorDock): shipped defaults, fail-closed normalizers for malformed persisted
 * values, and the removal of the sample-plugin `exampleSetting` residue (gap G17)
 * from both the type and the rendered Settings UI.
 *
 * Replaces test/example.test.ts, which asserted DEFAULT_SETTINGS.exampleSetting —
 * that field no longer exists.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md §T3.5
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Data Storage Changes, Known Technical Issues
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { App } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ViewRecord } from "../../src/store/types";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { RegisterCommandCallback } from "../../src/import/types";
import {
	DEFAULT_SETTINGS,
	isEditorDock,
	normalizeEditorDock,
	isExcludedFolders,
	normalizeExcludedFolders,
	isFileClassesFolder,
	normalizeFileClassesFolder,
	isTemplatesFolder,
	normalizeTemplatesFolder,
	isSchemaFolder,
	normalizeSchemaFolder,
	normalizeSettings,
} from "../../src/types/index";
import { DEFAULT_ARTIFACT_FOLDERS } from "../../src/artifacts/artifactTypes";

type RemoveCommandCallback = (viewId: string) => void;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeStore(initial: Record<string, ViewRecord> = {}): ViewStore {
	const data = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return new ViewStore(port);
}

function makeConsentGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "not-consented" as const })),
		requestConsent: vi.fn(async () => true),
		requestReConsent: vi.fn(async () => true),
	} as unknown as ConsentGate;
}

function makeImporter(): ViewImporter {
	return {
		scanVault: vi.fn(async () => []),
		parse: vi.fn(async () => { throw new Error("not used"); }),
		importToStore: vi.fn(async () => "id"),
	} as unknown as ViewImporter;
}

/** The undo journal's settings-facing part; these suites do not touch it. */
const noUndo = { setPersistence: async () => {}, clear: async () => {} };

const noop: RegisterCommandCallback = () => {};

function makePlugin(overrides: Partial<{
	fileClassesFolder: string;
	excludedFolders: string[];
	editorDock: "bottom" | "right";
}> = {}): {
	app: App;
	manifest: { id: string; name: string; version: string; minAppVersion: string };
	settings: {
		linkClickAction: "drill" | "open";
		curatedBasesFolder: string;
		fileClassesFolder: string;
		excludedFolders: string[];
		editorDock: "bottom" | "right";
	};
	saveSettings: Mock;
} {
	return {
		app: makeApp(),
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: {
			linkClickAction: "drill",
			curatedBasesFolder: "00 Meta/Bases",
			fileClassesFolder: overrides.fileClassesFolder ?? DEFAULT_SETTINGS.fileClassesFolder,
			excludedFolders: overrides.excludedFolders ?? [...DEFAULT_SETTINGS.excludedFolders],
			editorDock: overrides.editorDock ?? DEFAULT_SETTINGS.editorDock,
		},
		saveSettings: vi.fn(async () => {}),
	};
}

function makeTab(
	app: App,
	plugin: ReturnType<typeof makePlugin>,
	store: ViewStore,
	gate: ConsentGate,
	importer: ViewImporter,
	registerCommand: RegisterCommandCallback = noop,
	removeCommand: RemoveCommandCallback = () => {},
): SettingsTab {
	return new SettingsTab(app, plugin as never, store, gate, importer, registerCommand, removeCommand, noUndo);
}

async function renderTab(tab: SettingsTab): Promise<HTMLElement> {
	await tab.displayAsync();
	return tab.containerEl;
}

/** Find the Setting element for a given name using the data-setting-name attribute (mock convention). */
function findSettingEl(container: HTMLElement, name: string): Element | null {
	return container.querySelector(`[data-setting-name="${name}"]`);
}

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS — shipped defaults
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS — T3.5 fields", () => {
	it("fileClassesFolder defaults to '00 Meta/FileClasses'", () => {
		expect(DEFAULT_SETTINGS.fileClassesFolder).toBe("00 Meta/FileClasses");
	});

	it("excludedFolders defaults to ['00 Meta']", () => {
		expect(DEFAULT_SETTINGS.excludedFolders).toEqual(["00 Meta"]);
	});

	it("editorDock defaults to 'bottom'", () => {
		expect(DEFAULT_SETTINGS.editorDock).toBe("bottom");
	});

	it("has no exampleSetting key (sample-plugin residue removed, gap G17)", () => {
		expect(Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, "exampleSetting")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isEditorDock / normalizeEditorDock — fail-closed
// ---------------------------------------------------------------------------

describe("isEditorDock", () => {
	it("returns true for 'bottom'", () => expect(isEditorDock("bottom")).toBe(true));
	it("returns true for 'right'", () => expect(isEditorDock("right")).toBe(true));
	it("returns false for an unknown string", () => expect(isEditorDock("left")).toBe(false));
	it("returns false for a number", () => expect(isEditorDock(1)).toBe(false));
	it("returns false for null", () => expect(isEditorDock(null)).toBe(false));
	it("returns false for undefined", () => expect(isEditorDock(undefined)).toBe(false));
});

describe("normalizeEditorDock", () => {
	it("preserves 'bottom'", () => expect(normalizeEditorDock("bottom")).toBe("bottom"));
	it("preserves 'right'", () => expect(normalizeEditorDock("right")).toBe("right"));
	it("falls back to 'bottom' for a bogus string", () => expect(normalizeEditorDock("left")).toBe("bottom"));
	it("falls back to 'bottom' for a number", () => expect(normalizeEditorDock(1)).toBe("bottom"));
	it("falls back to 'bottom' for null", () => expect(normalizeEditorDock(null)).toBe("bottom"));
	it("falls back to 'bottom' for undefined", () => expect(normalizeEditorDock(undefined)).toBe("bottom"));
});

// ---------------------------------------------------------------------------
// isExcludedFolders / normalizeExcludedFolders — fail-closed
// ---------------------------------------------------------------------------

describe("isExcludedFolders", () => {
	it("returns true for an array of strings", () => expect(isExcludedFolders(["00 Meta"])).toBe(true));
	it("returns true for an empty array (exclude nothing is valid)", () => expect(isExcludedFolders([])).toBe(true));
	it("returns false for a non-array", () => expect(isExcludedFolders("00 Meta")).toBe(false));
	it("returns false for an array containing a non-string", () => expect(isExcludedFolders(["00 Meta", 42])).toBe(false));
	it("returns false for null", () => expect(isExcludedFolders(null)).toBe(false));
	it("returns false for undefined", () => expect(isExcludedFolders(undefined)).toBe(false));
});

describe("normalizeExcludedFolders", () => {
	it("preserves a valid array of strings", () => {
		expect(normalizeExcludedFolders(["Foo", "Bar"])).toEqual(["Foo", "Bar"]);
	});

	it("preserves an explicit empty array (exclude nothing is a legitimate choice, not malformed)", () => {
		expect(normalizeExcludedFolders([])).toEqual([]);
	});

	it("falls back to the default for a non-array", () => {
		expect(normalizeExcludedFolders("00 Meta")).toEqual(["00 Meta"]);
	});

	it("falls back to the default for an array containing a non-string", () => {
		expect(normalizeExcludedFolders(["00 Meta", 42])).toEqual(["00 Meta"]);
	});

	it("falls back to the default for null", () => {
		expect(normalizeExcludedFolders(null)).toEqual(["00 Meta"]);
	});

	it("falls back to the default for undefined", () => {
		expect(normalizeExcludedFolders(undefined)).toEqual(["00 Meta"]);
	});

	it("returns a fresh array, never the same reference as DEFAULT_SETTINGS.excludedFolders", () => {
		const valid = ["Foo", "Bar"];
		expect(normalizeExcludedFolders(valid)).not.toBe(valid);
		expect(normalizeExcludedFolders(valid)).not.toBe(DEFAULT_SETTINGS.excludedFolders);
		expect(normalizeExcludedFolders(undefined)).not.toBe(DEFAULT_SETTINGS.excludedFolders);
	});

	it("mutating the returned array does not corrupt DEFAULT_SETTINGS.excludedFolders", () => {
		const result = normalizeExcludedFolders(undefined);
		result.push("Corrupted");
		expect(DEFAULT_SETTINGS.excludedFolders).toEqual(["00 Meta"]);

		const resultFromValid = normalizeExcludedFolders(["00 Meta"]);
		resultFromValid.push("Also corrupted");
		expect(DEFAULT_SETTINGS.excludedFolders).toEqual(["00 Meta"]);
	});
});

// ---------------------------------------------------------------------------
// isFileClassesFolder / normalizeFileClassesFolder — fail-closed
// ---------------------------------------------------------------------------

describe("isFileClassesFolder", () => {
	it("returns true for a non-empty string", () => expect(isFileClassesFolder("00 Meta/FileClasses")).toBe(true));
	it("returns false for an empty string", () => expect(isFileClassesFolder("")).toBe(false));
	it("returns false for a number", () => expect(isFileClassesFolder(1)).toBe(false));
	it("returns false for null", () => expect(isFileClassesFolder(null)).toBe(false));
	it("returns false for undefined", () => expect(isFileClassesFolder(undefined)).toBe(false));
});

describe("normalizeFileClassesFolder", () => {
	it("preserves a non-empty string", () => expect(normalizeFileClassesFolder("Custom/FC")).toBe("Custom/FC"));
	it("falls back to the default for an empty string", () => {
		expect(normalizeFileClassesFolder("")).toBe("00 Meta/FileClasses");
	});
	it("strips trailing slashes, which would build a path with a double slash", () => {
		expect(normalizeFileClassesFolder("Custom/FC/")).toBe("Custom/FC");
		expect(normalizeFileClassesFolder("Custom/FC///")).toBe("Custom/FC");
	});
	it("falls back to the default for a setting of only slashes", () => {
		expect(normalizeFileClassesFolder("/")).toBe("00 Meta/FileClasses");
		expect(normalizeFileClassesFolder("///")).toBe("00 Meta/FileClasses");
	});
	it("falls back to the default for a non-string", () => expect(normalizeFileClassesFolder(1)).toBe("00 Meta/FileClasses"));
	it("falls back to the default for null", () => expect(normalizeFileClassesFolder(null)).toBe("00 Meta/FileClasses"));
	it("falls back to the default for undefined", () => expect(normalizeFileClassesFolder(undefined)).toBe("00 Meta/FileClasses"));
});

// ---------------------------------------------------------------------------
// SettingsTab — Scope section (FileClasses folder + Excluded folders)
// ---------------------------------------------------------------------------

describe("SettingsTab — Scope section", () => {
	it("renders a 'Scope' heading", async () => {
		const plugin = makePlugin();
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(container.textContent ?? "").toContain("Scope");
	});

	it("'FileClasses folder' text field reflects the current setting", async () => {
		const plugin = makePlugin({ fileClassesFolder: "Custom/FileClasses" });
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "FileClasses folder");
		expect(settingEl).not.toBeNull();
		const input = settingEl!.querySelector("input") as HTMLInputElement | null;
		expect(input?.value).toBe("Custom/FileClasses");
	});

	it("changing 'FileClasses folder' writes the trimmed value and saves", async () => {
		const plugin = makePlugin();
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "FileClasses folder");
		const input = settingEl!.querySelector("input") as HTMLInputElement;
		input.value = "  My/FileClasses  ";
		input.dispatchEvent(new Event("input"));

		await vi.waitFor(() => expect(plugin.settings.fileClassesFolder).toBe("My/FileClasses"));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("clearing 'FileClasses folder' falls back to the default (fail-closed)", async () => {
		const plugin = makePlugin({ fileClassesFolder: "Custom/FileClasses" });
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "FileClasses folder");
		const input = settingEl!.querySelector("input") as HTMLInputElement;
		input.value = "   ";
		input.dispatchEvent(new Event("input"));

		await vi.waitFor(() => expect(plugin.settings.fileClassesFolder).toBe("00 Meta/FileClasses"));
	});

	it("'Excluded folders' text field reflects the current setting as a comma-separated list", async () => {
		const plugin = makePlugin({ excludedFolders: ["00 Meta", "Templates"] });
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Excluded folders");
		expect(settingEl).not.toBeNull();
		const input = settingEl!.querySelector("input") as HTMLInputElement | null;
		expect(input?.value).toBe("00 Meta, Templates");
	});

	it("changing 'Excluded folders' parses a comma-separated list and saves", async () => {
		const plugin = makePlugin();
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Excluded folders");
		const input = settingEl!.querySelector("input") as HTMLInputElement;
		input.value = "00 Meta, Archive/Old , Templates";
		input.dispatchEvent(new Event("input"));

		await vi.waitFor(() =>
			expect(plugin.settings.excludedFolders).toEqual(["00 Meta", "Archive/Old", "Templates"]),
		);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("clearing 'Excluded folders' sets an EMPTY array — 'exclude nothing' is valid, not a fallback", async () => {
		const plugin = makePlugin({ excludedFolders: ["00 Meta"] });
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Excluded folders");
		const input = settingEl!.querySelector("input") as HTMLInputElement;
		input.value = "";
		input.dispatchEvent(new Event("input"));

		await vi.waitFor(() => expect(plugin.settings.excludedFolders).toEqual([]));
	});

	it("does not crash and falls back to shipped defaults when settings lack the T3.5 fields entirely", async () => {
		// A stale test double / pre-T3.5 caller may hand SettingsTab a settings
		// object without the new fields at all — the render must stay fail-closed
		// rather than throw (e.g. undefined.join()).
		const app = makeApp();
		const plugin = {
			app,
			manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
			settings: { linkClickAction: "drill", curatedBasesFolder: "00 Meta/Bases" },
			saveSettings: vi.fn(async () => {}),
		};
		const tab = new SettingsTab(
			app,
			plugin as never,
			makeStore(),
			makeConsentGate(),
			makeImporter(),
			noop,
			() => {},
			noUndo,
		);

		let container: HTMLElement | undefined;
		await expect((async () => { container = await renderTab(tab); })()).resolves.not.toThrow();

		const fcInput = findSettingEl(container!, "FileClasses folder")!.querySelector("input") as HTMLInputElement;
		expect(fcInput.value).toBe("00 Meta/FileClasses");
		const exInput = findSettingEl(container!, "Excluded folders")!.querySelector("input") as HTMLInputElement;
		expect(exInput.value).toBe("00 Meta");
	});
});

// ---------------------------------------------------------------------------
// exampleSetting removal — not in the rendered UI
// ---------------------------------------------------------------------------

describe("SettingsTab — exampleSetting removal (gap G17)", () => {
	it("does not render an 'Example setting' row", async () => {
		const plugin = makePlugin();
		const tab = makeTab(makeApp(), plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(findSettingEl(container, "Example setting")).toBeNull();
		expect(container.textContent ?? "").not.toContain("Example setting");
	});
});

// ---------------------------------------------------------------------------
// keepUndoHistory (spec 009 T2.6, AC-F7.1)
// ---------------------------------------------------------------------------

describe("keepUndoHistory", () => {
	it("defaults to true", () => {
		expect(DEFAULT_SETTINGS.keepUndoHistory).toBe(true);
		expect(normalizeSettings({}).keepUndoHistory).toBe(true);
		expect(normalizeSettings(null).keepUndoHistory).toBe(true);
	});

	it("keeps a stored false and a stored true", () => {
		expect(normalizeSettings({ keepUndoHistory: false }).keepUndoHistory).toBe(false);
		expect(normalizeSettings({ keepUndoHistory: true }).keepUndoHistory).toBe(true);
	});

	it.each([["false", "false"], ["0", 0], ["null", null], ["object", {}]])("falls back to true for a non-boolean (%s)", (_n, v) => {
		expect(normalizeSettings({ keepUndoHistory: v }).keepUndoHistory).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// templatesFolder / schemaFolder (spec 010, T2.1)
// ---------------------------------------------------------------------------

describe.each([
	["templatesFolder", "00 Meta/Templates", isTemplatesFolder, normalizeTemplatesFolder],
	["schemaFolder", "00 Meta/Schema", isSchemaFolder, normalizeSchemaFolder],
] as const)("%s", (key, def, isFn, normFn) => {
	it("defaults to the shipped artifact folder", () => {
		expect(DEFAULT_SETTINGS[key]).toBe(def);
		expect(DEFAULT_SETTINGS[key]).toBe(DEFAULT_ARTIFACT_FOLDERS[key]);
		expect(normalizeSettings({})[key]).toBe(def);
	});
	it("guard accepts a non-empty string only", () => {
		expect(isFn("Custom")).toBe(true);
		for (const v of ["", "   ", 1, null, undefined, {}, []]) expect(isFn(v)).toBe(false);
	});
	it("normaliser keeps a valid value and strips trailing slashes", () => {
		expect(normFn("Custom/Dir")).toBe("Custom/Dir");
		expect(normFn("Custom/Dir///")).toBe("Custom/Dir");
	});
	it("normaliser falls back for empty, whitespace, slashes-only and non-strings", () => {
		for (const v of ["", "  ", "/", "///", 1, null, undefined, true, {}]) expect(normFn(v)).toBe(def);
	});
	it("normalizeSettings keeps a stored valid value and falls back for an invalid one", () => {
		expect(normalizeSettings({ [key]: "My/Folder/" })[key]).toBe("My/Folder");
		expect(normalizeSettings({ [key]: 5 })[key]).toBe(def);
	});
});

describe("normalizeSettings — settings saved before the two folder keys existed", () => {
	it("loads unchanged and only gains the two defaults", () => {
		const legacy = {
			linkClickAction: "open",
			cardTitleOpensNote: false,
			curatedBasesFolder: "My/Bases",
			fileClassesFolder: "My/FC",
			excludedFolders: ["X"],
			editorDock: "right",
		};
		const out = normalizeSettings(legacy);
		expect(out).toMatchObject(legacy);
		expect(out.templatesFolder).toBe("00 Meta/Templates");
		expect(out.schemaFolder).toBe("00 Meta/Schema");
	});
});
