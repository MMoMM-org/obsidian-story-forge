/**
 * collectionSections — the Workbench Codex tab's sections, one per built-in collection (spec 008
 * T7.1d3; mockups-library.html L7a, P6, D3).
 *
 * A note's links into the four built-in collections are regrouped by the collection their target
 * belongs to, in Library order, with the relation key on the right. A collection whose Workbench
 * switch is off has no section, and its links are shown nowhere else: that is what the switch is
 * for. A link whose target belongs to no built-in stays wherever its panel drew it before.
 *
 * Membership is the Library's own rule (`resolveCollection`): the collection's tag, which may be
 * the user's override, outside the collection's own excluded folders. The panel renderers stay
 * pure; they are handed `PanelCollections` and never see the vault.
 */

import { getAllTags, type App, type TFile } from "obsidian";
import { resolveCollection } from "codex/collectionResolver";
import { normalizeTag } from "codex/noteIndex";
import type { LibraryCollection } from "library/collectionStore";
import { linkRow, section } from "panel/components";
import type { ResolvedEntity } from "scoping/NoteContext";

/** What a renderer needs to group links by collection. */
export interface PanelCollections {
	/** The built-ins with Workbench on, in Library order. A section is drawn only when it has entries. */
	readonly sections: ReadonlyArray<{ readonly id: string; readonly label: string }>;
	/** The built-in a note belongs to (on or off), or `null` when none claims it. */
	readonly collectionOf: (file: TFile) => string | null;
}

/** A link a section may list, with the relation key drawn on the right. */
export interface SectionCandidate {
	readonly entity: ResolvedEntity;
	readonly key: string;
}

type BuiltInRow = Pick<LibraryCollection, "id" | "label" | "tag" | "excludedFolders" | "effective" | "provenance">;

function tagsOf(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file);
	return cache ? (getAllTags(cache) ?? []).map(normalizeTag) : [];
}

/** Does `row` hold the one-note index? A misconfigured row (no tag) holds nothing. */
function claims(row: BuiltInRow, index: Array<{ path: string; tags: string[] }>): boolean {
	const found = resolveCollection(row.id, { [row.id]: { tag: row.tag } }, { excludedFolders: row.excludedFolders }, index);
	return found.status === "resolved" && found.notes.length > 0;
}

/** Build the sections from the Library's rows (only built-ins count), against `app`'s tags. */
export function buildPanelCollections(app: App, rows: readonly BuiltInRow[]): PanelCollections {
	const builtIns = rows.filter((r) => r.provenance === "built-in");
	return {
		sections: builtIns.filter((r) => r.effective.workbench).map((r) => ({ id: r.id, label: r.label })),
		collectionOf: (file) => {
			const index = [{ path: file.path, tags: tagsOf(app, file) }];
			return builtIns.find((r) => claims(r, index))?.id ?? null;
		},
	};
}

/** One row per note and key: a note both linked to and linking back with the same key is listed once. */
function withRow(rows: SectionCandidate[], next: SectionCandidate): SectionCandidate[] {
	const same = (c: SectionCandidate): boolean => c.entity.file.path === next.entity.file.path && c.key === next.key;
	return rows.some(same) ? rows : [...rows, next];
}

function drawSection(el: HTMLElement, label: string, rows: readonly SectionCandidate[]): void {
	const { bodyEl } = section(el, label, { count: rows.length });
	for (const { entity, key } of rows) {
		linkRow(bodyEl, entity.file.basename, { tag: key, path: entity.file.path });
	}
}

/**
 * Draw one section per Workbench-on built-in that has entries (none when empty: P6).
 * Returns the candidates no built-in claims, for the caller to place as before.
 */
export function renderCollectionSections(
	el: HTMLElement,
	candidates: readonly SectionCandidate[],
	collections: PanelCollections,
): SectionCandidate[] {
	const unclaimed: SectionCandidate[] = [];
	const byCollection = new Map<string, SectionCandidate[]>();
	for (const candidate of candidates) {
		const id = collections.collectionOf(candidate.entity.file);
		if (id === null) unclaimed.push(candidate);
		else byCollection.set(id, withRow(byCollection.get(id) ?? [], candidate));
	}
	for (const { id, label } of collections.sections) {
		const rows = byCollection.get(id) ?? [];
		if (rows.length > 0) drawSection(el, label, rows);
	}
	return unclaimed;
}

/**
 * A panel's one call (T7.1d3): draw the sections for the links it holds to built-in collections and
 * learn which entities stay in the panel's own sections. Without a Library every entity stays and
 * nothing is drawn. An unresolved link has no target to belong to, so it always stays.
 */
export function claimLinks(
	el: HTMLElement,
	candidates: readonly SectionCandidate[],
	collections: PanelCollections | undefined,
): (entity: ResolvedEntity) => boolean {
	if (!collections) return () => true;
	const real = candidates.filter((c) => !c.entity.unresolved);
	const unclaimed = new Set(renderCollectionSections(el, real, collections).map((c) => c.entity));
	const claimed = new Set(real.map((c) => c.entity).filter((e) => !unclaimed.has(e)));
	return (entity) => !claimed.has(entity);
}
