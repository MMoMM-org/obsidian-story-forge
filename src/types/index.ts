export interface PluginSettings {
	exampleSetting: string;
	/** ADR-5: link-click action; modifier-click inverts. Default: "drill". */
	linkClickAction: "drill" | "open";
	/**
	 * Vault folder where curated .base files are materialised on install.
	 * Default "00 Meta/Bases" (colocates with M3-seeded Canon.base/Manuscript.base).
	 * Falls back to the default when unset or empty.
	 * @ref SDD/ADR-5, SDD/Data Storage Changes — Settings.curatedBasesFolder
	 */
	curatedBasesFolder: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	exampleSetting: "default",
	linkClickAction: "drill",
	curatedBasesFolder: "00 Meta/Bases",
};

/** Type guard: returns true if `v` is a valid `linkClickAction` value. */
export function isLinkClickAction(v: unknown): v is PluginSettings["linkClickAction"] {
	return v === "drill" || v === "open";
}

/** Normalizer: returns `v` if it is a valid `linkClickAction`, otherwise `"drill"`. */
export function normalizeLinkClickAction(v: unknown): PluginSettings["linkClickAction"] {
	return isLinkClickAction(v) ? v : "drill";
}
