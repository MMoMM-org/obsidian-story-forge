/**
 * T3.3 – storyFilesWiring: the one place that maps the plugin settings to the story files
 * dialog and the read-only status (spec 010, S1, S1c, S7; ADR-42).
 *
 * The dialog and the status reader are module doubles here: this file proves only the mapping
 * (which settings, which store calls, which command). The dialog itself is covered by
 * StoryFilesModal.test.ts, the command end to end by main.storyFiles.test.ts.
 *
 * @ref PRD/F2.2 (command), F2.4 (button), F3.2 (folders saved)
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { App } from "obsidian";
import type { StoryFilesDeps } from "../../src/artifacts/StoryFilesModal";
import type { ArtifactIndex } from "../../src/artifacts/artifactTypes";
import type { ArtifactStore } from "../../src/artifacts/ArtifactStore";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types/index";

const doubles = vi.hoisted(() => ({
	opened: [] as StoryFilesDeps[],
	modals: [] as { setCloseCallback: Mock }[],
	statusCalls: [] as unknown[][],
}));

vi.mock("artifacts/StoryFilesModal", () => ({
	openStoryFiles: (deps: StoryFilesDeps) => {
		doubles.opened.push(deps);
		const modal = { setCloseCallback: vi.fn(function (this: unknown) { return this; }) };
		doubles.modals.push(modal);
		return modal;
	},
}));

vi.mock("artifacts/storyFilesStatus", () => ({
	readStoryFilesStatus: (...args: unknown[]) => {
		doubles.statusCalls.push(args);
		return Promise.resolve({ kind: "none" });
	},
}));

const { wireStoryFiles, STORY_FILES_COMMAND_ID, STORY_FILES_HINT_ID, storyFilesUpdatesHintId } = await import("../../src/artifacts/storyFilesWiring");

const index: ArtifactIndex = { version: "1", entries: [] };
const records = { "00 Meta/FileClasses/fc-a.md": { path: "00 Meta/FileClasses/fc-a.md" } };
const store = { all: () => records } as unknown as ArtifactStore;

function setup(overrides: Partial<PluginSettings> = {}) {
	let settings: PluginSettings = { ...DEFAULT_SETTINGS, ...overrides };
	const saveSettings = vi.fn(async (patch: Partial<PluginSettings>) => { settings = { ...settings, ...patch }; });
	const setScope = vi.fn(async (_folders: readonly string[]) => {});
	const dismissHint = vi.fn((_id: string) => {});
	const app = new App();
	const wiring = wireStoryFiles({
		app,
		settings: () => settings,
		saveSettings,
		setScope,
		dismissHint,
		store,
		index,
		pluginVersion: "0.2.0",
	});
	return { wiring, app, saveSettings, setScope, dismissHint, set: (p: Partial<PluginSettings>) => { settings = { ...settings, ...p }; } };
}

beforeEach(() => {
	doubles.opened.length = 0;
	doubles.modals.length = 0;
	doubles.statusCalls.length = 0;
});

describe("wireStoryFiles — the command (S1c)", () => {
	it("is set-up-story-files, named Set up story files, with no default hotkey", () => {
		const { wiring } = setup();
		expect(STORY_FILES_COMMAND_ID).toBe("set-up-story-files");
		expect(wiring.command.id).toBe("set-up-story-files");
		expect(wiring.command.name).toBe("Set up story files");
		expect("hotkeys" in wiring.command).toBe(false);
	});

	it("opens the dialog", () => {
		const { wiring } = setup();
		wiring.command.callback();
		expect(doubles.opened).toHaveLength(1);
	});
});

describe("wireStoryFiles — the dialog's dependencies", () => {
	it("reads the current settings each time (no snapshot)", () => {
		const { wiring, set } = setup();
		wiring.open();
		set({ templatesFolder: "Story/Templates" });
		expect(doubles.opened[0]!.settings().templatesFolder).toBe("Story/Templates");
	});

	it("passes the artifact store, index and plugin version", () => {
		const { wiring, app } = setup();
		wiring.open();
		const deps = doubles.opened[0]!;
		expect(deps.app).toBe(app);
		expect(deps.store).toBe(store);
		expect(deps.index).toBe(index);
		expect(deps.pluginVersion).toBe("0.2.0");
	});

	it("saves the three folders as settings", async () => {
		const { wiring, saveSettings } = setup();
		wiring.open();
		const folders = { fileClassesFolder: "A", templatesFolder: "B", schemaFolder: "C" };
		await doubles.opened[0]!.saveFolders(folders);
		expect(saveSettings).toHaveBeenCalledWith(folders);
	});

	it("adds a folder to the Scope tab's excluded folders through the collection store", async () => {
		const { wiring, setScope } = setup({ excludedFolders: ["00 Meta"] });
		wiring.open();
		await doubles.opened[0]!.addExcludedFolder("Story/Templates");
		expect(setScope).toHaveBeenCalledWith(["00 Meta", "Story/Templates"]);
	});

	it("does not add a folder that is already excluded", async () => {
		const { wiring, setScope } = setup({ excludedFolders: ["00 Meta", "Story"] });
		wiring.open();
		await doubles.opened[0]!.addExcludedFolder("Story");
		expect(setScope).not.toHaveBeenCalled();
	});

	it("runs onClose when the dialog closes, through Modal.setCloseCallback", () => {
		const { wiring } = setup();
		const onClose = vi.fn();
		wiring.open(onClose);
		const cb = doubles.modals[0]!.setCloseCallback.mock.calls[0]?.[0] as (() => void) | undefined;
		expect(onClose).not.toHaveBeenCalled();
		cb?.();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("sets no close callback when none is asked for", () => {
		const { wiring } = setup();
		wiring.open();
		expect(doubles.modals[0]!.setCloseCallback).not.toHaveBeenCalled();
	});
});

describe("wireStoryFiles — the status (one settings → folders mapping)", () => {
	it("reads the status with the current three folders and the store's records", async () => {
		const { wiring, set, app } = setup();
		set({ fileClassesFolder: "F", templatesFolder: "T", schemaFolder: "S" });
		await wiring.getStatus();
		expect(doubles.statusCalls[0]).toEqual([app, index, records, { fileClassesFolder: "F", templatesFolder: "T", schemaFolder: "S" }]);
	});
});

describe("wireStoryFiles — the Library hint preference (S7)", () => {
	it("is dismissed only once its id is in dismissedHints", () => {
		const { wiring, set } = setup();
		expect(wiring.isHintDismissed("setup")).toBe(false);
		set({ dismissedHints: [STORY_FILES_HINT_ID] });
		expect(wiring.isHintDismissed("setup")).toBe(true);
	});

	it("Don't show again records the hint id", () => {
		const { wiring, dismissHint } = setup();
		wiring.dismissHint("setup");
		expect(dismissHint).toHaveBeenCalledWith(STORY_FILES_HINT_ID);
	});

	it("R3: the updates hint has one id per plugin version", () => {
		const { wiring, set, dismissHint } = setup();
		expect(storyFilesUpdatesHintId("0.2.0")).toBe("story-files-updates-0.2.0");
		expect(wiring.isHintDismissed("updates")).toBe(false);
		wiring.dismissHint("updates");
		expect(dismissHint).toHaveBeenCalledWith("story-files-updates-0.2.0");
		set({ dismissedHints: ["story-files-updates-0.2.0"] });
		expect(wiring.isHintDismissed("updates")).toBe(true);
	});

	it("R3: an updates dismissal from another version does not hide it", () => {
		const { wiring } = setup({ dismissedHints: ["story-files-updates-0.1.0"] });
		expect(wiring.isHintDismissed("updates")).toBe(false);
	});

	it("R3: the two hints are dismissed independently", () => {
		const a = setup({ dismissedHints: [STORY_FILES_HINT_ID] });
		expect(a.wiring.isHintDismissed("updates")).toBe(false);
		const b = setup({ dismissedHints: ["story-files-updates-0.2.0"] });
		expect(b.wiring.isHintDismissed("setup")).toBe(false);
	});
});
