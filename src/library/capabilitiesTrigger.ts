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
	/**
	 * `workspace.layoutReady`: false while Obsidian restores the layout at startup. Asked only for a
	 * view opening; a call from the layout-ready callback is itself the evidence (Obsidian need not
	 * have flipped the flag yet when it runs those callbacks — live-test bug 2).
	 */
	isLayoutReady: () => boolean;
	isDismissed: () => boolean;
	/** Open the screen in its first-run form. */
	open: () => void;
}

/** Where the call came from: a view's `onOpen`, or the workspace's layout-ready callback. */
export type TriggerSource = "view" | "layout-ready";

const LOG = "[StoryForge] capability screen:";

/**
 * The call each view makes when it opens, and the layout-ready callback makes for a restored view.
 * Each early return says why in one `console.debug` line, so a live console can tell.
 */
export function createCapabilitiesTrigger(deps: CapabilitiesTriggerDeps): (source?: TriggerSource) => void {
	let shown = false;
	return (source: TriggerSource = "view"): void => {
		if (shown) return void console.debug(`${LOG} not shown — already shown this session`);
		if (deps.isDismissed()) return void console.debug(`${LOG} not shown — dismissed before (dismissedHints has "${CAPABILITIES_HINT_ID}")`);
		if (source === "view" && !deps.isLayoutReady()) {
			return void console.debug(`${LOG} not yet — the layout is still loading; checked again when it is ready`);
		}
		shown = true;
		console.debug(`${LOG} opening (first run)`);
		deps.open();
	};
}
