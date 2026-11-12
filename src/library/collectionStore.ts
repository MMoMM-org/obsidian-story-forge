/**
 * collectionStore — the Library's data layer (spec 008 F7, Phase 7 T7.1a).
 *
 * Built-in collections and user collections (imported, or installed from the repo)
 * are one ordered list. Each carries an enable checkbox, which is the master, and two
 * surface toggles (Anvil, Workbench) whose values are kept while the checkbox is off
 * (P1, L9). The Cards list is the same idea without surfaces, plus "used by".
 *
 * Pure: no DOM and no Obsidian runtime. All IO goes through `LibraryPort`, which
 * `ViewStore` (records) and the plugin's settings (everything else) satisfy. This module
 * never touches a vault file: removing an entry drops the record, never the file (P16).
 *
 * @ref docs/XDD/specs/008-codex-surface/mockups-library.html — P1, P2, P5, P10, P13, P16, P19, L9
 */

import { BUILT_IN_COLLECTIONS, type CodexCollection } from "codex/codexTab";
import { BUILT_IN_CARD_IDS, CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { defaultSurfaces, type ViewRecord } from "store/types";

export { defaultSurfaces };
import {
	LIBRARY_MIGRATED_HINT_ID,
	type BuiltInCollectionOverride,
	type PluginSettings,
} from "types/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Engine = ViewRecord["engine"];
export type Surface = "anvil" | "workbench";
export type SurfaceFlags = Record<Surface, boolean>;
/** Three-valued provenance as the Library shows it (L2, L4). */
export type LibraryProvenance = "built-in" | "from-repo" | "imported";
export type Outcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Everything the store reads and writes. `ViewStore` covers the first three members. */
export interface LibraryPort {
	getViews(): Promise<Record<string, ViewRecord>>;
	setRecord(id: string, record: ViewRecord): Promise<void>;
	deleteRecord(id: string): Promise<void>;
	loadSettings(): Promise<PluginSettings>;
	/** Merge `patch` into the persisted settings. */
	saveSettings(patch: Partial<PluginSettings>): Promise<void>;
}

/** A collection row. Assignable to `CodexCollection`, so a pill list feeds `renderCodexTab` as is. */
export interface LibraryCollection extends CodexCollection {
	readonly provenance: LibraryProvenance;
	/** Undefined for a built-in, which is a native tag query. */
	readonly engine?: Engine;
	/** The toggle values, kept while the checkbox is off. */
	readonly surfaces: SurfaceFlags;
	/** What actually shows: the checkbox AND the toggle (L9 table). */
	readonly effective: SurfaceFlags;
	/** The tag in force; `""` when the collection has none (a file or a script is the query). */
	readonly tag: string;
	/** Excluded folders in force (Scope's list unless the built-in has its own). */
	readonly excludedFolders: readonly string[];
	readonly sameAsScope: boolean;
}

export interface LibraryCard {
	readonly id: string;
	readonly label: string;
	readonly provenance: LibraryProvenance;
	readonly enabled: boolean;
	/** False only for Hero, the fallback Card (P19). */
	readonly canDisable: boolean;
}

export interface BuiltInConfigPatch {
	/** Replaces the default tag; blank restores the default. */
	readonly tag?: string;
	/** An own list, or `null` for "same as Scope". */
	readonly excludedFolders?: readonly string[] | null;
}

const HERO_ID = CODEX_CARD_REGISTRY.defaultId;
const BUILT_IN_ENABLED: SurfaceFlags = { anvil: true, workbench: true };

// ---------------------------------------------------------------------------
// Pure model
// ---------------------------------------------------------------------------

function effectiveOf(enabled: boolean, surfaces: SurfaceFlags): SurfaceFlags {
	return { anvil: enabled && surfaces.anvil, workbench: enabled && surfaces.workbench };
}

function builtInRow(base: CodexCollection, o: BuiltInCollectionOverride, scope: readonly string[]): LibraryCollection {
	const enabled = o.enabled ?? true;
	const surfaces = { anvil: o.anvil ?? BUILT_IN_ENABLED.anvil, workbench: o.workbench ?? BUILT_IN_ENABLED.workbench };
	return {
		id: base.id,
		label: base.label,
		provenance: "built-in",
		enabled,
		surfaces,
		effective: effectiveOf(enabled, surfaces),
		tag: o.tag ?? base.tag,
		excludedFolders: o.excludedFolders ?? scope,
		sameAsScope: o.excludedFolders === undefined,
	};
}

function basename(path: string): string {
	const file = path.split("/").pop() ?? path;
	const dot = file.lastIndexOf(".");
	return dot > 0 ? file.slice(0, dot) : file;
}

function recordRow(id: string, rec: ViewRecord, scope: readonly string[]): LibraryCollection {
	const surfaces = { ...rec.surfaces };
	return {
		id,
		label: rec.commandName ?? basename(rec.source),
		provenance: rec.provenance === "curated" ? "from-repo" : "imported",
		engine: rec.engine,
		enabled: rec.enabled,
		surfaces,
		effective: effectiveOf(rec.enabled, surfaces),
		tag: rec.generated?.params.tag ?? "",
		excludedFolders: rec.generated?.params.excludedFolders ?? scope,
		sameAsScope: rec.generated === undefined,
	};
}

/** Built-ins first (shipped order), then the collection records in record order. */
export function buildCollections(views: Record<string, ViewRecord>, settings: PluginSettings): LibraryCollection[] {
	const builtIns = BUILT_IN_COLLECTIONS.map((c) =>
		builtInRow(c, settings.builtInCollections[c.id] ?? {}, settings.excludedFolders),
	);
	const records = Object.entries(views)
		.filter(([, rec]) => rec.kind === "collection")
		.map(([id, rec]) => recordRow(id, rec, settings.excludedFolders));
	return [...builtIns, ...records];
}

/** Built-in Cards first (registry order), then card records in record order. */
export function buildCards(views: Record<string, ViewRecord>, settings: PluginSettings): LibraryCard[] {
	const builtIns = CODEX_CARD_REGISTRY.list()
		.filter((c) => BUILT_IN_CARD_IDS.has(c.id))
		.map((c): LibraryCard => {
			const canDisable = c.id !== HERO_ID;
			const enabled = !canDisable || !settings.disabledCards.includes(c.id);
			return { id: c.id, label: c.label, provenance: "built-in", enabled, canDisable };
		});
	const records = Object.entries(views)
		.filter(([, rec]) => rec.kind === "card")
		.map(([id, rec]): LibraryCard => ({
			id,
			label: rec.commandName ?? basename(rec.source),
			provenance: rec.provenance === "curated" ? "from-repo" : "imported",
			enabled: rec.enabled,
			canDisable: true,
		}));
	return [...builtIns, ...records];
}

/** Anvil pills: enabled collections with Anvil on, in Library order. */
export function anvilPills(list: readonly LibraryCollection[]): LibraryCollection[] {
	return list.filter((c) => c.effective.anvil);
}

/** Workbench Codex-tab sections (D3, P6): built-ins with Workbench on. */
export function workbenchSections(list: readonly LibraryCollection[]): LibraryCollection[] {
	return list.filter((c) => c.provenance === "built-in" && c.effective.workbench);
}

/** Workbench tabs (P7): imported and from-repo collections with Workbench on. */
export function workbenchTabs(list: readonly LibraryCollection[]): LibraryCollection[] {
	return list.filter((c) => c.provenance !== "built-in" && c.effective.workbench);
}

/**
 * The collections whose chosen Card is `cardId` (an unknown or absent choice means Hero).
 * Dataview collections never use a Card (P8), so they are left out.
 */
export function collectionsUsingCard(
	cardId: string,
	list: readonly LibraryCollection[],
	cards: readonly LibraryCard[],
	cardByCollection: Record<string, string>,
): LibraryCollection[] {
	const known = new Set(cards.map((c) => c.id));
	const chosen = (id: string): string => {
		const pick = cardByCollection[id];
		return pick !== undefined && known.has(pick) ? pick : HERO_ID;
	};
	return list.filter((c) => c.engine !== "dataview-dql" && c.engine !== "dataviewjs" && chosen(c.id) === cardId);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const REFUSE = (reason: string): Outcome => ({ ok: false, reason });
const OK: Outcome = { ok: true };
const isBuiltInId = (id: string): boolean => BUILT_IN_COLLECTIONS.some((c) => c.id === id);

export class CollectionStore {
	constructor(private readonly port: LibraryPort) {}

	// --- reads ---------------------------------------------------------------

	async collections(): Promise<LibraryCollection[]> {
		return buildCollections(await this.port.getViews(), await this.port.loadSettings());
	}

	async cards(): Promise<LibraryCard[]> {
		return buildCards(await this.port.getViews(), await this.port.loadSettings());
	}

	async anvilPills(): Promise<LibraryCollection[]> {
		return anvilPills(await this.collections());
	}

	async workbenchSections(): Promise<LibraryCollection[]> {
		return workbenchSections(await this.collections());
	}

	async workbenchTabs(): Promise<LibraryCollection[]> {
		return workbenchTabs(await this.collections());
	}

	async usedBy(cardId: string): Promise<LibraryCollection[]> {
		const [views, settings] = [await this.port.getViews(), await this.port.loadSettings()];
		return collectionsUsingCard(cardId, buildCollections(views, settings), buildCards(views, settings), settings.cardByCollection);
	}

	// --- collection writes ---------------------------------------------------

	/** The checkbox. The surface toggles are not touched (P1). */
	async setEnabled(id: string, enabled: boolean): Promise<Outcome> {
		return this.patchCollection(id, { enabled }, (rec) => ({ ...rec, enabled }));
	}

	/** One surface toggle; saved at once, kept while the checkbox is off. */
	async setSurface(id: string, surface: Surface, on: boolean): Promise<Outcome> {
		return this.patchCollection(id, { [surface]: on }, (rec) => ({ ...rec, surfaces: { ...rec.surfaces, [surface]: on } }));
	}

	/** P10: a built-in's tag and excluded folders. */
	async configureBuiltIn(id: string, patch: BuiltInConfigPatch): Promise<Outcome> {
		if (!isBuiltInId(id)) return REFUSE(`"${id}" is not a built-in collection`);
		const next: BuiltInCollectionOverride = { ...(await this.builtInOverride(id)) };
		if (patch.tag !== undefined) setOrDrop(next, "tag", patch.tag.trim() || undefined);
		if (patch.excludedFolders !== undefined) {
			setOrDrop(next, "excludedFolders", patch.excludedFolders === null ? undefined : [...patch.excludedFolders]);
		}
		await this.saveBuiltIn(id, next);
		return OK;
	}

	/** P5, P16: drop the record and its Card choice. Never a built-in, never a file. */
	async remove(id: string): Promise<Outcome> {
		if (isBuiltInId(id)) return REFUSE("A built-in collection can be disabled, not removed");
		const rec = (await this.port.getViews())[id];
		if (rec?.kind !== "collection") return REFUSE(`No collection "${id}"`);
		await this.port.deleteRecord(id);
		await this.forgetCardChoices((collectionId) => collectionId === id);
		return OK;
	}

	// --- card writes ---------------------------------------------------------

	/** P19: Hero cannot be disabled. */
	async setCardEnabled(cardId: string, enabled: boolean): Promise<Outcome> {
		if (cardId === HERO_ID && !enabled) return REFUSE("Hero is the fallback Card and is always available");
		const views = await this.port.getViews();
		const rec = views[cardId];
		if (rec?.kind === "card") {
			await this.port.setRecord(cardId, { ...rec, enabled });
			return OK;
		}
		if (!BUILT_IN_CARD_IDS.has(cardId)) return REFUSE(`No card "${cardId}"`);
		const disabled = (await this.port.loadSettings()).disabledCards.filter((id) => id !== cardId);
		await this.port.saveSettings({ disabledCards: enabled ? disabled : [...disabled, cardId] });
		return OK;
	}

	/** L8c: drop a card record; collections that chose it fall back to Hero. Never a file. */
	async removeCard(cardId: string): Promise<Outcome> {
		if (BUILT_IN_CARD_IDS.has(cardId)) return REFUSE("A built-in Card can be disabled, not removed");
		const rec = (await this.port.getViews())[cardId];
		if (rec?.kind !== "card") return REFUSE(`No card "${cardId}"`);
		await this.port.deleteRecord(cardId);
		const choices = (await this.port.loadSettings()).cardByCollection;
		await this.forgetCardChoices((collectionId) => choices[collectionId] === cardId);
		return OK;
	}

	// --- migration (D2, P13) -------------------------------------------------

	/**
	 * Turn every legacy Dataview / DataviewJS view into an imported collection with
	 * Workbench on and Anvil off, so today's Workbench tabs stay. Returns how many moved.
	 * Idempotent: a moved record is a collection, so a second run finds nothing and writes
	 * nothing. A legacy Bases view has no valid collection shape (its source is YAML, not a
	 * path), so it is left alone.
	 */
	async migrate(): Promise<number> {
		const legacy = Object.entries(await this.port.getViews()).filter(
			([, rec]) => rec.kind === "view" && rec.engine !== "bases",
		);
		for (const [id, rec] of legacy) {
			await this.port.setRecord(id, { ...rec, kind: "collection", surfaces: defaultSurfaces(rec.engine) });
		}
		if (legacy.length > 0) await this.addToMigrationCount(legacy.length);
		return legacy.length;
	}

	/** The one-time "your views are now collections" line, or null. */
	async migrationNotice(): Promise<{ moved: number } | null> {
		const s = await this.port.loadSettings();
		const shown = s.libraryMigratedCount > 0 && !s.dismissedHints.includes(LIBRARY_MIGRATED_HINT_ID);
		return shown ? { moved: s.libraryMigratedCount } : null;
	}

	async dismissMigrationNotice(): Promise<void> {
		const { dismissedHints } = await this.port.loadSettings();
		if (dismissedHints.includes(LIBRARY_MIGRATED_HINT_ID)) return;
		await this.port.saveSettings({ dismissedHints: [...dismissedHints, LIBRARY_MIGRATED_HINT_ID] });
	}

	// --- private -------------------------------------------------------------

	private async addToMigrationCount(moved: number): Promise<void> {
		const s = await this.port.loadSettings();
		if (s.dismissedHints.includes(LIBRARY_MIGRATED_HINT_ID)) return;
		await this.port.saveSettings({ libraryMigratedCount: s.libraryMigratedCount + moved });
	}

	/** Route a collection write to the settings (built-in) or its record. */
	private async patchCollection(
		id: string,
		override: BuiltInCollectionOverride,
		onRecord: (rec: ViewRecord) => ViewRecord,
	): Promise<Outcome> {
		if (isBuiltInId(id)) {
			await this.saveBuiltIn(id, { ...(await this.builtInOverride(id)), ...override });
			return OK;
		}
		const rec = (await this.port.getViews())[id];
		if (rec?.kind !== "collection") return REFUSE(`No collection "${id}"`);
		await this.port.setRecord(id, onRecord(rec));
		return OK;
	}

	private async builtInOverride(id: string): Promise<BuiltInCollectionOverride> {
		return (await this.port.loadSettings()).builtInCollections[id] ?? {};
	}

	private async saveBuiltIn(id: string, override: BuiltInCollectionOverride): Promise<void> {
		const all = (await this.port.loadSettings()).builtInCollections;
		await this.port.saveSettings({ builtInCollections: { ...all, [id]: override } });
	}

	private async forgetCardChoices(shouldForget: (collectionId: string) => boolean): Promise<void> {
		const current = (await this.port.loadSettings()).cardByCollection;
		const kept = Object.fromEntries(Object.entries(current).filter(([id]) => !shouldForget(id)));
		await this.port.saveSettings({ cardByCollection: kept });
	}
}

function setOrDrop<K extends keyof BuiltInCollectionOverride>(
	target: BuiltInCollectionOverride,
	key: K,
	value: BuiltInCollectionOverride[K] | undefined,
): void {
	if (value === undefined) delete target[key];
	else target[key] = value;
}
