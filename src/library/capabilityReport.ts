/**
 * capabilityReport — what the capability screen says about each optional plugin (spec 008 T7.4,
 * PRD F8, ADR-36; mockups-capabilities.html L12a–c, S3/S4/S6).
 *
 * Pure: no DOM and no `obsidian` import. The host reads the facts with the detections that already
 * exist (`getBasesCapability`, `getDataviewApi`, `getDvSettings`, the FileClass cache) and this
 * module turns them into rows.
 *
 * The list is the code's list, not a wish list: Story Forge touches exactly three optional plugins.
 * Bases is core: it may be suggested, and its row names where it lives, as text (S4; Obsidian's
 * settings can't be opened through the public API). Dataview and metadata-menu are community:
 * listed, never nagged, with no place and no action (ADR-36). Status is information: absence is
 * "off" (grey), never a warning tone.
 *
 * Text marks code with backticks (`.base`); the modal draws those as code.
 */

/** What the host found when the screen opened. */
export interface CapabilityFacts {
	/** `basesCapability`: "absent" is an Obsidian without Bases (unreachable on 1.12.7+). */
	bases: "enabled" | "disabled" | "absent";
	/**
	 * Dataview as Story Forge sees it: loaded or not (a disabled and a missing plugin look the same,
	 * S3), and its "Enable JavaScript queries" setting.
	 */
	dataview: { active: boolean; jsEnabled: boolean };
	/** The FileClass files in the configured folder, which Story Forge reads itself. */
	fileClasses: { count: number; folder: string };
}

export type CapabilityKind = "core" | "community";

/** "on" and "off" are drawn ✓ / ○; "neutral" is plain text. None of them is a warning. */
export interface CapabilityStatus {
	text: string;
	tone: "on" | "off" | "neutral";
}

/** A setting of the plugin that changes what it adds (Dataview's JavaScript queries). */
export interface CapabilitySub {
	label: string;
	value: string;
	rest: string;
	lost: string;
}

export interface CapabilityRow {
	id: "bases" | "dataview" | "metadata-menu";
	name: string;
	kind: CapabilityKind;
	status: CapabilityStatus;
	adds: readonly string[];
	lostWithout: readonly string[];
	/** Core only: where it is turned on (S4: named as text, no action). */
	where?: string;
	/** How current the status is (Bases: read at load, L12 amended); drawn at the end of the how-paragraph. */
	note?: string;
	sub?: CapabilitySub;
}

const BASES_STATUS: Record<CapabilityFacts["bases"], CapabilityStatus> = {
	enabled: { text: "On", tone: "on" },
	disabled: { text: "Off", tone: "off" },
	absent: { text: "Not in this Obsidian version", tone: "off" },
};

function basesRow(facts: CapabilityFacts): CapabilityRow {
	return {
		id: "bases",
		name: "Bases",
		kind: "core",
		status: BASES_STATUS[facts.bases],
		adds: [
			"Draws `.base` collections (imported or from the repo) in the Anvil and the Workbench, with the Card you chose.",
			"Adds Story Forge Hero, Table and Compact as view types in your own `.base` files.",
		],
		lostWithout: [
			"`.base` collections show \"<name> needs Bases\" instead of their entries.",
			"Bases views in the Workbench fall back to a read-only list, without sorting, filtering or columns.",
			"The four built-in collections, the Workbench and the field editor work the same.",
		],
		where: "Settings › Core plugins › Bases",
		// L12 amended (user, option B): no public API sees Bases turned on or off at runtime, so the
		// status is the load-time value (ADR-8 revised) and the row says so. Not for an Obsidian
		// without Bases, where there is nothing to turn on.
		...(facts.bases !== "absent" ? { note: "Read when Story Forge loaded; after turning it on or off, restart Obsidian." } : {}),
	};
}

function dataviewRow(facts: CapabilityFacts): CapabilityRow {
	const { active, jsEnabled } = facts.dataview;
	return {
		id: "dataview",
		name: "Dataview",
		kind: "community",
		status: active ? { text: "Active", tone: "on" } : { text: "Not active", tone: "off" },
		adds: [
			"Runs Dataview and DataviewJS collections: the notes you imported, your migrated views, and Dataview entries from the repo.",
		],
		lostWithout: [
			"Those collections do not run. Their Library row and Workbench tab say they need Dataview.",
			"You can still import and install them. They run once Dataview is active.",
			"Built-in and `.base` collections are not affected.",
		],
		// The setting lives in a loaded Dataview; without one there is nothing to read.
		...(active
			? {
				sub: {
					label: "JavaScript queries (DataviewJS):",
					value: jsEnabled ? "On" : "Off",
					rest: " in Dataview settings.",
					lost: "Without them, DataviewJS collections show \"DataviewJS disabled\" and do not run.",
				},
			}
			: {}),
	};
}

function fileClassStatus({ count, folder }: CapabilityFacts["fileClasses"]): CapabilityStatus {
	if (count === 0) return { text: `No FileClasses in ${folder}`, tone: "off" };
	return { text: `${count} ${count === 1 ? "FileClass" : "FileClasses"} in ${folder}`, tone: "neutral" };
}

function metadataMenuRow(facts: CapabilityFacts): CapabilityRow {
	return {
		id: "metadata-menu",
		name: "metadata-menu",
		kind: "community",
		// S6: Story Forge never detects the plugin; it reads the files metadata-menu writes.
		status: fileClassStatus(facts.fileClasses),
		adds: [
			"A form for editing FileClasses (`fc-*.md`): which fields a kind of note has, their types, options and order.",
			// O9 (spec 010): observed by the maintainer; the live walk (T3.5) checks it before release.
			"Option lists from the FileClasses outside Story Forge too: in Obsidian's Properties panel you pick a value such as _male_ for _gender_ from a list.",
		],
		lostWithout: [
			"Nothing changes in Story Forge. It reads FileClass files itself; Set up story files… writes its own for the eight story types. You edit them as plain notes.",
			"With no FileClasses at all, the editor lists every property under \"Properties\", without sections or option lists.",
			"Obsidian's Properties panel shows plain text fields; option lists exist only in Story Forge's editor.",
		],
	};
}

/** The screen's rows, core first, whatever is present. */
export function capabilityReport(facts: CapabilityFacts): CapabilityRow[] {
	return [basesRow(facts), dataviewRow(facts), metadataMenuRow(facts)];
}

/**
 * The pointer row for Story Forge's own story files (spec 010 S6, D11). Its status is live and
 * comes from `storyFilesStatus`; the text here does not change. Written only when the user asks
 * (PRD F2.9): the row's button opens the setup dialog, the screen itself writes nothing.
 */
export interface StoryFilesRowContent {
	name: string;
	kindLabel: string;
	adds: readonly string[];
	lostWithout: readonly string[];
	buttonLabel: string;
	/** Under the button: before any set-up, and once something is set up. */
	asideNotSetUp: string;
	asideSetUp: string;
}

export function storyFilesRow(): StoryFilesRowContent {
	return {
		name: "Story files",
		kindLabel: "Story Forge",
		adds: [
			"FileClasses for the eight story types: the editor shows their sections, option lists and field order.",
			"Templates for a new scene or entity, for Obsidian's core Templates plugin.",
			"A schema reference: one note per story type that explains each Property and its values.",
		],
		lostWithout: [
			"The editor lists every property under \"Properties\", without sections or option lists.",
			"You create scenes and entities by hand and add their Properties yourself.",
		],
		buttonLabel: "Set up story files…",
		asideNotSetUp: "Shows every file and folder first. Nothing is written until you confirm.",
		asideSetUp: "Check for updates and set up missing files.",
	};
}
