/**
 * reverseIndex — builds backlinks for a subject file.
 *
 * Uses metadataCache.resolvedLinks as the pre-computed reverse index
 * (ADR-1 / ADR-8): for every source file that references the subject,
 * discriminates typed frontmatter backlinks from body-only (fuzzy) mentions.
 *
 * Fuzzy backlinks are only emitted when the subject kind is "object" or
 * "lore" AND the source kind is "scene". All other body-only mentions are
 * silently dropped.
 */

import { TFile, type App } from "obsidian";
import type { EntityKind, ResolvedEntity } from "./NoteContext";

/**
 * Build the list of backlinks pointing to `subject`.
 *
 * @param app         - Obsidian App instance (provides metadataCache + vault).
 * @param subject     - The file whose backlinks are being computed.
 * @param subjectKind - The pre-classified EntityKind of the subject.
 * @param classify    - Function that returns the EntityKind of any TFile.
 * @returns           Array of ResolvedEntity with relation "backlink".
 */
export function buildBacklinks(
	app: App,
	subject: TFile,
	subjectKind: EntityKind,
	classify: (file: TFile) => EntityKind,
): ResolvedEntity[] {
	const out: ResolvedEntity[] = [];
	const { resolvedLinks } = app.metadataCache;
	const subjectPath = subject.path;

	for (const srcPath in resolvedLinks) {
		if (!resolvedLinks[srcPath]?.[subjectPath]) continue;

		const srcAbstract = app.vault.getAbstractFileByPath(srcPath);
		if (!(srcAbstract instanceof TFile)) continue;
		const srcFile: TFile = srcAbstract;

		const cache = app.metadataCache.getFileCache(srcFile);
		if (!cache) continue;

		const srcKind = classify(srcFile);
		let typed = false;

		for (const fm of cache.frontmatterLinks ?? []) {
			const dest = app.metadataCache.getFirstLinkpathDest(fm.link, srcPath);
			if (dest?.path !== subjectPath) continue;

			out.push({
				file: srcFile,
				kind: srcKind,
				relation: "backlink",
				field: fm.key.replace(/\.\d+$/, ""),
			});
			typed = true;
		}

		if (
			!typed &&
			(subjectKind === "object" || subjectKind === "lore") &&
			srcKind === "scene"
		) {
			out.push({ file: srcFile, kind: srcKind, relation: "backlink", fuzzy: true });
		}
	}

	return out;
}
