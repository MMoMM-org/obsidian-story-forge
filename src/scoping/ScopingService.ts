/**
 * ScopingService — resolves the story context for a given note.
 *
 * Framework-light: takes an App instance but delegates all vault access
 * through metadataCache so calls can be tested with mock metadata.
 *
 * ADR-3: outgoing relations from frontmatter + frontmatterLinks only;
 *        resolvedLinks NOT used; backlinks seam empty in M1.
 * ADR-4: tag-first classification; frontmatter `type` as fallback.
 */

import { TFile, getAllTags, type App } from "obsidian";
import {
	isEntityKind,
	type EntityKind,
	type NoteContext,
	type ResolvedEntity,
} from "./NoteContext";
import { buildBacklinks } from "./reverseIndex";

// ---------------------------------------------------------------------------
// Tag → EntityKind mapping (ADR-4)
// ---------------------------------------------------------------------------

/** Maps known tag prefixes/exact tags to EntityKind. Order matters: first match wins. */
const TAG_MAP: ReadonlyArray<[string, EntityKind]> = [
	["#canon/character", "character"],
	["#canon/location", "location"],
	["#canon/object", "object"],
	["#canon/lore", "lore"],
	["#manuscript/scene", "scene"],
	["#planning/plotline", "plotline"],
	["#planning/book", "book"],
];

// ---------------------------------------------------------------------------
// ScopingService
// ---------------------------------------------------------------------------

export class ScopingService {
	constructor(private readonly app: App) {}

	// -------------------------------------------------------------------------
	// classify
	// -------------------------------------------------------------------------

	/**
	 * Classify a file's EntityKind.
	 *
	 * Strategy (ADR-4):
	 * 1. Read tags from metadataCache; match against TAG_MAP (first match wins).
	 * 2. Fall back to frontmatter `type` field if it's a valid EntityKind.
	 * 3. Return "unknown" if neither yields a result.
	 *
	 * Never throws; returns "unknown" when cache is null (pre-index).
	 */
	classify(file: TFile): EntityKind {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return "unknown";

		// 1. Tag-first
		const tags = getAllTags(cache) ?? [];
		for (const [tag, kind] of TAG_MAP) {
			if (tags.includes(tag)) return kind;
		}

		// 2. Frontmatter type fallback
		const t: unknown = cache.frontmatter?.["type"];
		if (isEntityKind(t)) return t;

		return "unknown";
	}

	// -------------------------------------------------------------------------
	// resolve
	// -------------------------------------------------------------------------

	/**
	 * Build a NoteContext for the given file.
	 *
	 * Reads frontmatterLinks from the file's CachedMetadata; for each link,
	 * resolves via metadataCache.getFirstLinkpathDest(); classifies the target;
	 * strips array indices from the key to derive the source field name.
	 *
	 * Never throws; returns an empty-entities context when cache is null.
	 */
	resolve(file: TFile): NoteContext {
		const cache = this.app.metadataCache.getFileCache(file);

		if (!cache) {
			return {
				activeFile: file,
				activeKind: "unknown",
				entities: [],
				backlinks: [],
				frontmatter: {},
				resolvedAt: Date.now(),
			};
		}

		const activeKind = this.classify(file);
		const entities: ResolvedEntity[] = [];

		for (const fmLink of cache.frontmatterLinks ?? []) {
			// Derive the frontmatter field name by stripping array indices.
			// e.g. "characters.0" → "characters", "pov" → "pov"
			const field = fmLink.key.replace(/\.\d+$/, "");

			const targetFile = this.app.metadataCache.getFirstLinkpathDest(
				fmLink.link,
				file.path,
			);

			if (!targetFile) {
				// Unresolved link: mark it, include a TFile stub so consumers can
				// read the attempted link path. Resolution continues (ADR-3).
				//
				// Object.create is used to build a stub with the correct prototype
				// without constructing a full vault-backed TFile; the path carries
				// the link text so callers know what was referenced.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const placeholder: TFile = Object.create(TFile.prototype);
				placeholder.path = fmLink.link;

				entities.push({
					file: placeholder,
					kind: "unknown",
					relation: "outgoing",
					field,
					unresolved: true,
				});
				continue;
			}

			const kind = this.classify(targetFile);
			entities.push({
				file: targetFile,
				kind,
				relation: "outgoing",
				field,
			});
		}

		return {
			activeFile: file,
			activeKind,
			entities,
			backlinks: buildBacklinks(this.app, file, activeKind, (f) => this.classify(f)),
			frontmatter: cache.frontmatter ?? {},
			resolvedAt: Date.now(),
		};
	}
}
