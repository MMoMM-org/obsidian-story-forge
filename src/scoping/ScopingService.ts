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

import { getAllTags, type App, type TFile } from "obsidian";
import {
	isEntityKind,
	type EntityKind,
	type NoteContext,
	type ResolvedEntity,
} from "./NoteContext";

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
		const t = cache.frontmatter?.["type"];
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
				// Unresolved link: mark it, but we still need a TFile placeholder.
				// Per the spec, unresolved:true is set and resolution continues.
				// We use a minimal placeholder so the entity is still included.
				//
				// The placeholder carries only the path derived from the link text —
				// it should NOT be used for further resolution.
				const placeholder = Object.create(null) as TFile;
				Object.defineProperty(placeholder, "path", {
					value: fmLink.link,
					writable: false,
					enumerable: true,
					configurable: false,
				});

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
			backlinks: [], // seam — M3
			resolvedAt: Date.now(),
		};
	}
}
