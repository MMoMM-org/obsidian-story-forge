export interface PluginSettings {
	exampleSetting: string;
	/** ADR-5: link-click action; modifier-click inverts. Default: "drill". */
	linkClickAction: "drill" | "open";
}

export const DEFAULT_SETTINGS: PluginSettings = {
	exampleSetting: "default",
	linkClickAction: "drill",
};

/** Type guard: returns true if `v` is a valid `linkClickAction` value. */
export function isLinkClickAction(v: unknown): v is PluginSettings["linkClickAction"] {
	return v === "drill" || v === "open";
}

/** Normalizer: returns `v` if it is a valid `linkClickAction`, otherwise `"drill"`. */
export function normalizeLinkClickAction(v: unknown): PluginSettings["linkClickAction"] {
	return isLinkClickAction(v) ? v : "drill";
}
