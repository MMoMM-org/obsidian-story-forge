/**
 * fileClassVault — the vault-facing half of FileClass resolution (T5.3).
 *
 * `fileClassReader.ts` shipped pure: it walks an `extends` chain over an
 * injected `FileClassLookup` and knows nothing about a vault. That left two
 * adaptation jobs for the first task that actually renders an editor, and this
 * module is both of them — deliberately beside the pure layer, never inside it,
 * the same split `codex/noteIndex.ts` makes for the collection resolver:
 *
 *   1. **read** a FileClass's frontmatter from `<fileClassesFolder>/<name>.md`;
 *   2. **decide which FileClass applies to a note**, which the SDD's algorithm
 *      calls `fileClassesApplyingTo(note)`.
 *
 * Resolution order for (2), highest first:
 *   a. the note's own `fileClass` frontmatter key — metadata-menu's primary
 *      mechanism, and the only one that can reach a user's own FileClass:
 *      `fc-character-fantasy` ships with **empty** `tagNames`/`filesPaths`
 *      (see the generated file), so a chain leaf is otherwise unreachable and
 *      S103 could not happen at all. **Added beyond the SDD's "by tagNames /
 *      filesPaths"**, and reported rather than assumed.
 *   b. a FileClass whose `tagNames` matches one of the note's tags;
 *   c. a FileClass whose `filesPaths` contains the note's folder.
 *
 * Nothing here requires metadata-menu to be installed (CON-3) — a FileClass is
 * plain frontmatter in a folder, which is exactly why we read the format
 * instead of depending on the plugin that writes it.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Complex Logic, step 1
 * @ref src/fileclass/fileClassReader.ts — the pure consumer of `FileClassLookup`
 */

import { TFile, getAllTags, type App } from "obsidian";
import type { FileClassLookup } from "fileclass/fileClassTypes";

/** Reading FileClasses out of one vault folder, plus which one applies to a note. */
export interface FileClassSource {
	/** The `resolveFileClassChain` port, backed by the FileClasses folder. */
	readonly lookup: FileClassLookup;
	/** The FileClass a note starts its chain from, or `undefined` for none (tier 2). */
	nameFor(file: TFile): string | undefined;
}

/**
 * Build a `FileClassSource` over `app`.
 *
 * `folder` is a getter, not a value: `main.ts` reassigns `settings` on save, so
 * a captured folder would go stale the moment the user changed it — the same
 * convention every other injected setting in this plugin follows.
 *
 * `snapshot` reads the folder's FileClasses once, on first need, and reuses
 * them for this source's lifetime. Without it, every `nameFor` for a note with
 * no `fileClass` key scans the vault. Build a snapshot source per render pass
 * (a Card grid), never keep one across vault changes. T6.4 owns the general cache.
 */
export function createFileClassSource(
	app: App,
	folder: () => string,
	options: { readonly snapshot?: boolean } = {},
): FileClassSource {
	const frontmatterOf = (file: TFile): Record<string, unknown> | undefined =>
		app.metadataCache.getFileCache(file)?.frontmatter;

	const fileFor = (name: string): TFile | null => {
		const found = app.vault.getAbstractFileByPath(`${folder()}/${name}.md`);
		return found instanceof TFile ? found : null;
	};

	const declaredClasses = (): { name: string; frontmatter: Record<string, unknown> }[] => {
		const prefix = `${folder()}/`;
		return app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(prefix))
			.map((file) => ({ name: file.basename, frontmatter: frontmatterOf(file) ?? {} }));
	};

	let scanned: ReturnType<typeof declaredClasses> | undefined;
	const classes = (): ReturnType<typeof declaredClasses> =>
		options.snapshot === true ? (scanned ??= declaredClasses()) : declaredClasses();

	return {
		lookup: {
			getFileClassFrontmatter: (name: string): unknown => {
				const file = fileFor(name);
				return file === null ? undefined : frontmatterOf(file);
			},
		},
		nameFor: (file: TFile): string | undefined =>
			declaredName(frontmatterOf(file)) ?? claimedName(app, file, classes()),
	};
}

/** (a) The note says which FileClass it uses. */
function declaredName(frontmatter: Record<string, unknown> | undefined): string | undefined {
	const declared = frontmatter?.["fileClass"];
	return typeof declared === "string" && declared.trim() !== "" ? declared.trim() : undefined;
}

/** (b) then (c): a FileClass claims the note's tag, or the folder it lives in. */
function claimedName(
	app: App,
	file: TFile,
	classes: readonly { name: string; frontmatter: Record<string, unknown> }[],
): string | undefined {
	const cache = app.metadataCache.getFileCache(file);
	const tags = new Set((cache ? (getAllTags(cache) ?? []) : []).map(stripHash));

	const byTag = classes.find((fc) => listOf(fc.frontmatter["tagNames"]).some((tag) => tags.has(stripHash(tag))));
	if (byTag) return byTag.name;

	const byPath = classes.find((fc) =>
		listOf(fc.frontmatter["filesPaths"]).some((path) => file.path.startsWith(`${path}/`)),
	);
	return byPath?.name;
}

/**
 * The strings in a frontmatter list.
 *
 * The narrowing is load-bearing, not defensive tidiness: every generated
 * FileClass that claims nothing writes
 *
 *     tagNames:
 *       - 
 *
 * which YAML parses to `[null]` — NOT `[""]`, as an earlier version of this
 * comment claimed. Dropping the `typeof` check therefore throws
 * `Cannot read properties of null` on `startsWith` for any vault holding the
 * shipped `fc-character-fantasy`, i.e. every vault.
 *
 * Entries that survive the narrowing but claim nothing (`""`) need no filter:
 * no note carries a tag named `""`, and a `filesPaths` of `""` tests
 * `startsWith("/")`, which no vault-relative path satisfies.
 */
function listOf(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === "string");
}

function stripHash(tag: string): string {
	return tag.startsWith("#") ? tag.slice(1) : tag;
}
