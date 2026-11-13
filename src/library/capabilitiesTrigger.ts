/**
 * capabilitiesTrigger — when the capability screen opens by itself (spec 008 T7.4, PRD F8;
 * mockups-capabilities.html S1).
 *
 * Once: the first time the Anvil or the Workbench opens after install or upgrade, never at plugin
 * load (a view restored while the layout loads is not the user opening it), and never again once
 * any close has recorded `CAPABILITIES_HINT_ID` in `dismissedHints` (operational state, data.json).
 * Within one session it opens at most once even before that dismissal is saved, so the Anvil and
 * the Workbench opening together do not stack two.
 */

/** The `PluginSettings.dismissedHints` id that records the screen was seen. */
export const CAPABILITIES_HINT_ID = "capabilities";

export interface CapabilitiesTriggerDeps {
	/** `workspace.layoutReady`: false while Obsidian restores the layout at startup. */
	isLayoutReady: () => boolean;
	isDismissed: () => boolean;
	/** Open the screen in its first-run form. */
	open: () => void;
}

/** The call each view makes when it opens. */
export function createCapabilitiesTrigger(deps: CapabilitiesTriggerDeps): () => void {
	let shown = false;
	return (): void => {
		if (shown || !deps.isLayoutReady() || deps.isDismissed()) return;
		shown = true;
		deps.open();
	};
}
