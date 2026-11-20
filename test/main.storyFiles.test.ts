/**
 * main.storyFiles.test.ts — T3.3 (spec 010, S1c, S6, S7; ADR-42)
 *
 * The production wiring of the story files dialog through the plugin's own onload:
 * - the command `set-up-story-files` ("Set up story files", no default hotkey) opens the dialog;
 * - the capability screen's "Set up story files…" opens the same dialog;
 * - the settings tab gets the same status and dialog (one settings → folders mapping), and a
 *   fresh vault reads "Not set up";
 * - running the command writes nothing until the dialog's own confirm.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import type { StoryForgeData } from "store/types";
import type { StoryFilesTabDeps } from "settings/SettingsTab";

const settingsTabArgs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("settings/SettingsTab", async (importOriginal) => {
	const actual = await importOriginal<typeof import("settings/SettingsTab")>();
	class CapturingSettingsTab extends actual.SettingsTab {
		constructor(...args: ConstructorParameters<typeof actual.SettingsTab>) {
			super(...args);
			settingsTabArgs.calls.push(args);
		}
	}
	return { ...actual, SettingsTab: CapturingSettingsTab };
});

type Plugin = InstanceType<typeof import("main").default>;

async function makePlugin(): Promise<{ plugin: Plugin; app: App }> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	app.workspace.getActiveFile = vi.fn(() => null);
	const plugin = new StoryForgePlugin(app) as Plugin;
	let data: StoryForgeData = {} as StoryForgeData;
	plugin.loadData.mockImplementation(async () => structuredClone(data));
	plugin.saveData.mockImplementation(async (d: unknown) => { data = structuredClone(d as StoryForgeData); });
	await plugin.onload();
	return { plugin, app };
}

const dialog = (): HTMLElement | null =>
	[...document.body.querySelectorAll<HTMLElement>(".sf-story-modal")].find((m) => m.isConnected) ?? null;

function storyFilesDeps(): StoryFilesTabDeps {
	const deps = settingsTabArgs.calls.at(-1)?.find(
		(arg): arg is { storyFiles: StoryFilesTabDeps } => typeof arg === "object" && arg !== null && "storyFiles" in arg,
	);
	if (!deps) throw new Error("no LibraryDeps argument with storyFiles");
	return deps.storyFiles;
}

afterEach(() => {
	document.body.innerHTML = "";
	settingsTabArgs.calls.length = 0;
});

describe("main.ts — Set up story files (S1c)", () => {
	it("registers set-up-story-files, named Set up story files, with no default hotkey", async () => {
		const { plugin } = await makePlugin();
		const cmd = plugin._commands.get("story-forge:set-up-story-files") as { name: string; hotkeys?: unknown } | undefined;
		expect(cmd?.name).toBe("Set up story files");
		expect(cmd?.hotkeys).toBeUndefined();
	});

	it("the command opens the dialog and writes nothing", async () => {
		const { plugin, app } = await makePlugin();
		plugin._commands.get("story-forge:set-up-story-files")?.callback?.();
		expect(dialog()).not.toBeNull();
		await new Promise((r) => setTimeout(r, 0));
		for (const fn of [app.vault.create, app.vault.modify, app.vault.process, app.vault.createFolder]) {
			expect(fn).not.toHaveBeenCalled();
		}
	});

	it("the capability screen's Set up story files… opens the same dialog", async () => {
		await makePlugin();
		const lib = settingsTabArgs.calls.at(-1)?.find(
			(arg): arg is { openCapabilities: () => void } => typeof arg === "object" && arg !== null && "openCapabilities" in arg,
		);
		lib?.openCapabilities();
		const btn = [...document.body.querySelectorAll<HTMLButtonElement>(".sf-cap-modal button")]
			.find((b) => b.textContent === "Set up story files…");
		btn?.click();
		expect(dialog()).not.toBeNull();
	});

	it("hands the settings tab the status and the dialog; a fresh vault reads Not set up", async () => {
		await makePlugin();
		const deps = storyFilesDeps();
		const status = await deps.getStatus();
		expect(status.kind).toBe("none");
		expect(deps.isHintDismissed()).toBe(false);
		deps.open();
		expect(dialog()).not.toBeNull();
	});

	it("the settings tab's onClose runs once the real dialog closes (Cancel)", async () => {
		await makePlugin();
		const onClose = vi.fn();
		storyFilesDeps().open(onClose);
		const cancel = await vi.waitFor(() => {
			const b = [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent === "Cancel");
			if (!b) throw new Error("no Cancel yet");
			return b;
		});
		expect(onClose).not.toHaveBeenCalled();
		cancel.click();
		expect(dialog()).toBeNull();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Don't show again is stored in the settings (data.json)", async () => {
		const { plugin } = await makePlugin();
		const deps = storyFilesDeps();
		deps.dismissHint();
		expect(deps.isHintDismissed()).toBe(true);
		expect(plugin.settings.dismissedHints).toContain("story-files-not-set-up");
	});
});
