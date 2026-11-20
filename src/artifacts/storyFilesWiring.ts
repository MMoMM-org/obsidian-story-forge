/**
 * storyFilesWiring — what `main.ts` hands the command palette, the capability screen and the
 * settings tab for the story files (spec 010 T3.3, S1, S1c, S6, S7). Kept here so `main.ts` stays
 * lifecycle wiring and the settings → folders mapping lives in exactly one place.
 *
 * - `command`: `set-up-story-files`, "Set up story files", no default hotkey (S1c, ADR-42).
 * - `open(onClose?)`: the setup dialog; `onClose` runs after it closes (the settings tab redraws
 *   its status line and hint then).
 * - `getStatus()`: the read-only status (S1b) with the current three folders.
 * - `isHintDismissed(kind)` / `dismissHint(kind)`: the Library hints' dismissals, one id each in
 *   `dismissedHints` — operational state in data.json, never story data. `setup` is S7a's
 *   "Don't show again"; `updates` is R3's "Not now", one id per plugin version.
 *
 * Nothing here writes a vault file; only the dialog's own confirm does.
 *
 * @ref SDD/ADR-42
 * @ref PRD/F2.2, F2.4, F3.2
 */

import type { App } from "obsidian";
import { normalizeExcludedFolders, type PluginSettings } from "types/index";
import { openStoryFiles } from "artifacts/StoryFilesModal";
import { readStoryFilesStatus, type StoryFilesStatus } from "artifacts/storyFilesStatus";
import type { ArtifactStore } from "./ArtifactStore";
import type { ArtifactFolders, ArtifactIndex } from "./artifactTypes";

export const STORY_FILES_COMMAND_ID = "set-up-story-files";
/** `dismissedHints` id for the Library tab's "Story files are not set up" hint (S7, O8). */
export const STORY_FILES_HINT_ID = "story-files-not-set-up";

/** `dismissedHints` id for the Library hint for available updates (R3): one per plugin version. */
export const storyFilesUpdatesHintId = (pluginVersion: string): string => `story-files-updates-${pluginVersion}`;

/** Which Library hint: S7a "not set up" (`setup`) or R3 "updates available" (`updates`). */
export type StoryFilesHintKind = "setup" | "updates";

export interface StoryFilesWiringDeps {
	app: App;
	/** The live settings, read on every call (never a snapshot). */
	settings: () => PluginSettings;
	/** Merge `patch` into the settings and save them (data.json). */
	saveSettings: (patch: Partial<PluginSettings>) => Promise<void>;
	/** The Scope tab's Excluded folders write: the collection store's `setScope`. */
	setScope: (folders: readonly string[]) => Promise<unknown>;
	/** Record a dismissed hint id (main's `_dismissHint`). */
	dismissHint: (id: string) => void;
	store: ArtifactStore;
	index: ArtifactIndex;
	pluginVersion: string;
}

export interface StoryFilesWiring {
	command: { id: string; name: string; callback: () => void };
	open: (onClose?: () => void) => void;
	getStatus: () => Promise<StoryFilesStatus>;
	isHintDismissed: (kind: StoryFilesHintKind) => boolean;
	dismissHint: (kind: StoryFilesHintKind) => void;
}

export function wireStoryFiles(d: StoryFilesWiringDeps): StoryFilesWiring {
	const folders = (): ArtifactFolders => {
		const s = d.settings();
		return { fileClassesFolder: s.fileClassesFolder, templatesFolder: s.templatesFolder, schemaFolder: s.schemaFolder };
	};
	const hintId = (kind: StoryFilesHintKind): string =>
		kind === "setup" ? STORY_FILES_HINT_ID : storyFilesUpdatesHintId(d.pluginVersion);
	const open = (onClose?: () => void): void => {
		const modal = openStoryFiles({
			app: d.app,
			settings: d.settings,
			saveFolders: (f) => d.saveSettings({ ...f }),
			addExcludedFolder: async (folder) => {
				const current = normalizeExcludedFolders(d.settings().excludedFolders);
				if (current.includes(folder)) return;
				await d.setScope([...current, folder]);
			},
			store: d.store,
			index: d.index,
			pluginVersion: d.pluginVersion,
		});
		if (onClose) modal.setCloseCallback(onClose);
	};
	return {
		command: { id: STORY_FILES_COMMAND_ID, name: "Set up story files", callback: () => open() },
		open,
		getStatus: () => readStoryFilesStatus(d.app, d.index, d.store.all(), folders()),
		isHintDismissed: (kind) => d.settings().dismissedHints.includes(hintId(kind)),
		dismissHint: (kind) => d.dismissHint(hintId(kind)),
	};
}
