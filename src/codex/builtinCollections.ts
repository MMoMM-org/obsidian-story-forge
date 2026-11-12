/**
 * builtinCollections — the four collections that ship with the plugin (PRD/F3).
 * Dependency-free so settings normalisation can know the ids without pulling in
 * the Codex tab's markup code.
 */

/** A collection as the tab renders it: a pill, a tag, and whether it is on. */
export interface CodexCollection {
	/** Stable id — the pill's `data-sf-collection` value and the selection key. */
	readonly id: string;
	/** Sentence-case pill label (obsidianmd UI-text rule). */
	readonly label: string;
	/** The tag whose notes belong to this collection (no leading `#`). */
	readonly tag: string;
	/** A disabled collection has no pill at all (PRD/F7) — it is not merely dimmed. */
	readonly enabled: boolean;
	/**
	 * Folders excluded from THIS collection (Library, T7.1d1). Absent: the host's Scope list
	 * applies. An empty list is "exclude nothing", not "follow Scope".
	 */
	readonly excludedFolders?: readonly string[];
	/**
	 * Set for a Library collection that a query engine draws (a `.base` file, a Dataview query).
	 * Absent: a native tag query, which the Codex draws itself with a Card. (T7.1d2)
	 */
	readonly engine?: "bases" | "dataview-dql" | "dataviewjs";
	/** Where the collection came from (Library rows only). A pill that is not built-in is drawn dashed (S93's `.usr`). */
	readonly provenance?: "built-in" | "from-repo" | "imported";
}

/**
 * The four collections that ship enabled (PRD/F3 AC). Tags match the seed
 * vault's canon vocabulary. Phase 7's Library replaces this default with the
 * store-backed list; until then it is what every host passes.
 */
export const BUILT_IN_COLLECTIONS: readonly CodexCollection[] = [
	{ id: "character", label: "Characters", tag: "canon/character", enabled: true },
	{ id: "location", label: "Locations", tag: "canon/location", enabled: true },
	{ id: "object", label: "Objects", tag: "canon/object", enabled: true },
	{ id: "lore", label: "Lore", tag: "canon/lore", enabled: true },
];
