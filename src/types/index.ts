export interface PluginSettings {
	exampleSetting: string;
	/** ADR-5: link-click action; modifier-click inverts. Default: "drill". */
	linkClickAction: "drill" | "open";
}

export const DEFAULT_SETTINGS: PluginSettings = {
	exampleSetting: "default",
	linkClickAction: "drill",
};
