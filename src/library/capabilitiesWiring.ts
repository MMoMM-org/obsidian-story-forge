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
import { CapabilitiesModal } from "library/CapabilitiesModal";
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
}

export interface CapabilitiesWiring {
	/** The Library link: the screen with only Close. */
	openFromSettings: () => void;
	/** Each view's `onOpened`: the first-run screen, once. */
	onViewOpened: () => void;
}

export function wireCapabilities(d: CapabilitiesWiringDeps): CapabilitiesWiring {
	const getFacts = (): CapabilityFacts => ({
		bases: d.getBasesCapability(),
		dataview: { active: getDataviewApi(d.app) !== undefined, jsEnabled: getDvSettings(d.app).enableDataviewJs },
		fileClasses: { count: d.countFileClasses(), folder: d.getFileClassesFolder() },
	});
	const open = (mode: "first-run" | "settings"): void => {
		new CapabilitiesModal(d.app, {
			getFacts,
			mode,
			...(mode === "first-run" ? { onDismiss: () => d.dismissHint(CAPABILITIES_HINT_ID) } : {}),
		}).open();
	};
	return {
		openFromSettings: () => open("settings"),
		onViewOpened: createCapabilitiesTrigger({
			isLayoutReady: () => d.app.workspace.layoutReady,
			isDismissed: () => d.getDismissedHints().includes(CAPABILITIES_HINT_ID),
			open: () => open("first-run"),
		}),
	};
}
