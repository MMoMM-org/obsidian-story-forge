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
	classifyEntityKind,
	type EntityKind,
	type NoteContext,
	type ResolvedEntity,
} from "./NoteContext";
import { buildBacklinks } from "./reverseIndex";

/** Strip Obsidian's leading `#` so a raw metadataCache tag matches `classifyEntityKind`'s unprefixed vocabulary. */
function stripLeadingHash(tag: string): string {
	return tag.startsWith("#") ? tag.slice(1) : tag;
}

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
	 * Strategy (ADR-4): tag-first (metadataCache's tags carry Obsidian's `#`,
	 * stripped before matching), then frontmatter `type` fallback. The mapping
	 * itself — and this two-step strategy — lives once in
	 * `classifyEntityKind` (`NoteContext.ts`), shared with Card classification
	 * (`codex/cards/shared.ts`) so the two can't independently drift.
	 *
	 * Never throws; returns "unknown" when cache is null (pre-index).
	 */
	classify(file: TFile): EntityKind {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return "unknown";

		const tags = (getAllTags(cache) ?? []).map(stripLeadingHash);
		return classifyEntityKind(tags, cache.frontmatter?.["type"]);
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Object.create returns any; the stub has TFile.prototype by construction
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
