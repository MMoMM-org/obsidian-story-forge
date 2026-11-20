/**
 * capabilitiesWiring — what `main.ts` hands the views and the settings tab for the capability
 * screen (spec 008 T7.4, S1/S3). Kept here so `main.ts` stays lifecycle wiring.
 *
 * The facts come only from the detections that already exist (mockups-capabilities.html, "What
 * this commits us to"): `getBasesCapability`, `getDataviewApi`, `getDvSettings` and the FileClass
 * cache. No new plugin detection, and no `app.plugins` read outside EngineRegistry.
 */

import type { App } from "obsidian";
import type { BasesCapability } from "bases/basesCapability";
import { getDataviewApi, getDvSettings } from "engines/EngineRegistry";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import { CapabilitiesModal } from "library/CapabilitiesModal";
import type { StoryFilesStatus } from "artifacts/storyFilesStatus";
import type { CapabilityFacts } from "library/capabilityReport";
import { CAPABILITIES_HINT_ID, createCapabilitiesTrigger } from "library/capabilitiesTrigger";

export interface CapabilitiesWiringDeps {
	app: App;
	getBasesCapability: () => BasesCapability;
	/** The FileClass cache's count, and the folder it reads. */
	countFileClasses: () => number;
	getFileClassesFolder: () => string;
	getDismissedHints: () => readonly string[];
	/** Persist a dismissal (operational state, data.json). */
	dismissHint: (id: string) => void;
	/** The story files status, read-only (spec 010 S6). */
	getStoryFilesStatus: () => Promise<StoryFilesStatus>;
	/**
	 * Opens the story files setup dialog from the screen's row (spec 010 T3.4). Optional until the
	 * dialog is wired (T3.3); absent, the row's button only closes the screen.
	 */
	openStoryFiles?: () => void;
}

export interface CapabilitiesWiring {
	/** The Library link: the screen with only Close. */
	openFromSettings: () => void;
	/** Each view's `onOpened`: the first-run screen, once. */
	onViewOpened: () => void;
	/**
	 * For `workspace.onLayoutReady`: Obsidian restores an Anvil or a Workbench before layout is ready,
	 * so its `onOpen` is skipped (not at plugin load), and clicking a restored tab never runs `onOpen`
	 * again. A view restored at startup counts as opened: if one exists (popout windows included),
	 * the first-run screen opens now, under the same once-per-session and dismissed guards.
	 */
	onLayoutReady: () => void;
}

export function wireCapabilities(d: CapabilitiesWiringDeps): CapabilitiesWiring {
	const getFacts = (): CapabilityFacts => ({
		bases: d.getBasesCapability(),
		dataview: { active: getDataviewApi(d.app) !== undefined, jsEnabled: getDvSettings(d.app).enableDataviewJs },
		fileClasses: { count: d.countFileClasses(), folder: d.getFileClassesFolder() },
	});
	const open = (mode: "first-run" | "settings"): void => {
		try {
			new CapabilitiesModal(d.app, {
				getFacts,
				getStoryFilesStatus: d.getStoryFilesStatus,
				...(d.openStoryFiles ? { openStoryFiles: d.openStoryFiles } : {}),
				mode,
				...(mode === "first-run" ? { onDismiss: () => d.dismissHint(CAPABILITIES_HINT_ID) } : {}),
			}).open();
		} catch (err) {
			// A fact that cannot be read yet must not vanish inside a layout-ready callback.
			console.error("[StoryForge] capability screen: could not open", err);
		}
	};
	const onViewOpened = createCapabilitiesTrigger({
		isLayoutReady: () => d.app.workspace.layoutReady,
		isDismissed: () => d.getDismissedHints().includes(CAPABILITIES_HINT_ID),
		open: () => open("first-run"),
	});
	const restoredView = (): boolean =>
		[WORKSPACE_VIEW_TYPE, SIDEBAR_VIEW_TYPE].some((type) => d.app.workspace.getLeavesOfType(type).length > 0);
	return {
		openFromSettings: () => open("settings"),
		onViewOpened,
		onLayoutReady: () => {
			if (restoredView()) return onViewOpened("layout-ready");
			console.debug("[StoryForge] capability screen: not yet — no Anvil or Workbench is open; it opens with the first one");
		},
	};
}
