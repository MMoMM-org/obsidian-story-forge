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
 * The plugin keeps **one** of these (T6.4): `main.ts` owns it and hands it to
 * every consumer. What it holds is a *generation*: the folder's FileClasses and
 * each one read by name, dropped together when anything in the folder changes
 * or the folder setting does (SDD/Quality Requirements). A note's own answer
 * from `nameFor` is deliberately not cached: it depends on that note's tags,
 * which change without touching the folder, and costs no scan once the classes
 * are held.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Complex Logic, step 1
 * @ref src/fileclass/fileClassReader.ts — the pure consumer of `FileClassLookup`
 */

import { TFile, debounce, getAllTags, type App, type EventRef } from "obsidian";
import type { FileClassLookup } from "fileclass/fileClassTypes";
import { DEBOUNCE_MS } from "pluginConstants";

/** Reading FileClasses out of one vault folder, plus which one applies to a note. */
export interface FileClassSource {
	/** The `resolveFileClassChain` port, backed by the FileClasses folder. */
	readonly lookup: FileClassLookup;
	/** The FileClass a note starts its chain from, or `undefined` for none (tier 2). */
	nameFor(file: TFile): string | undefined;
}

/** A `FileClassSource` that also says when what it answers has changed. */
export interface FileClassCache extends FileClassSource {
	/**
	 * Be told after the folder's FileClasses change, once per burst. Not called
	 * for a change of the folder setting, which a cache only sees on its next read.
	 *
	 * @returns the call that stops it
	 */
	subscribe(listener: () => void): () => void;
}

/** The cache as its owner holds it: the owner, and only the owner, can end it. */
export interface OwnedFileClassCache extends FileClassCache {
	/** Cancel a change still pending and drop every subscriber. For the owner's unload. */
	dispose(): void;
	/**
	 * How many FileClass files the folder holds (subfolders included). Counts notes that have
	 * frontmatter; the value-list notes the setup writes have none. Used by the capability screen's
	 * metadata-menu row: Story Forge reads the files, it never detects the plugin.
	 */
	count(): number;
}

interface DeclaredClass {
	readonly name: string;
	readonly frontmatter: Record<string, unknown>;
}

/** What one folder held, until something in it changes. */
interface Generation {
	readonly folder: string;
	classes?: readonly DeclaredClass[];
	readonly byName: Map<string, unknown>;
}

/**
 * Build the FileClass cache over `app`.
 *
 * `folder` is a getter, not a value: `main.ts` reassigns `settings` on save, so
 * every read compares it and starts a new generation when it moved.
 *
 * A read of a file Obsidian has not indexed yet is answered but never kept:
 * `getFileCache` is `null` until then, and the first index at startup need not
 * fire `changed`, so keeping it could strand an empty FileClass for the session.
 *
 * @param registerEvent the owner's `Component.registerEvent`, which releases
 *        the listeners on unload
 */
export function createFileClassCache(
	app: App,
	folder: () => string,
	registerEvent: (ref: EventRef) => void,
): OwnedFileClassCache {
	let generation: Generation | null = null;
	const listeners = new Set<() => void>();
	const notify = debounce((): void => { runListeners(listeners); }, DEBOUNCE_MS, true);

	const current = (): Generation => {
		const now = folder();
		if (generation?.folder !== now) generation = { folder: now, byName: new Map() };
		return generation;
	};

	watchFolder(app, folder, registerEvent, () => {
		generation = null;
		notify();
	});

	return {
		lookup: { getFileClassFrontmatter: (name) => lookUp(app, current(), name) },
		nameFor: (file: TFile): string | undefined =>
			declaredName(app.metadataCache.getFileCache(file)?.frontmatter) ?? claimedName(app, file, classesIn(app, current())),
		count: (): number => classesIn(app, current()).filter((c) => Object.keys(c.frontmatter).length > 0).length,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		dispose: () => {
			notify.cancel();
			listeners.clear();
		},
	};
}

/**
 * Tell each subscriber, isolating them from one another: a throwing listener is
 * logged and the rest still run, and one that left earlier in the pass is skipped.
 */
function runListeners(listeners: ReadonlySet<() => void>): void {
	for (const listener of [...listeners]) {
		if (!listeners.has(listener)) continue;
		try {
			listener();
		} catch (error) {
			console.error("[StoryForge] a FileClass subscriber failed", error);
		}
	}
}

/** Call `onChange` when a file appears in, leaves, or changes inside the folder. */
function watchFolder(
	app: App,
	folder: () => string,
	registerEvent: (ref: EventRef) => void,
	onChange: () => void,
): void {
	const inFolder = (path: string): boolean => path === folder() || path.startsWith(`${folder()}/`);
	const check = (file: { readonly path: string }): void => { if (inFolder(file.path)) onChange(); };

	registerEvent(app.metadataCache.on("changed", check));
	registerEvent(app.vault.on("create", check));
	registerEvent(app.vault.on("delete", check));
	registerEvent(app.vault.on("rename", (file, oldPath) => {
		if (inFolder(file.path) || inFolder(oldPath)) onChange();
	}));
}

/**
 * The FileClass file called `name`: `<folder>/<name>.md` first, else any file of
 * that name below the folder. `classesIn` scans recursively, so a class in a
 * subfolder can claim a note; resolving it by the same rule keeps that claim
 * from pointing at nothing. Metadata-menu names a class by its file's
 * basename wherever it sits under the folder, so subfolders are kept rather
 * than cutting the scan back.
 */
function classFile(app: App, generation: Generation, name: string): unknown {
	const direct = app.vault.getAbstractFileByPath(`${generation.folder}/${name}.md`);
	if (direct) return direct;
	const prefix = `${generation.folder}/`;
	return app.vault.getMarkdownFiles().find((f) => f.basename === name && f.path.startsWith(prefix));
}

/** The named FileClass's frontmatter, read at most once per generation. */
function lookUp(app: App, generation: Generation, name: string): unknown {
	if (generation.byName.has(name)) return generation.byName.get(name);
	const file = classFile(app, generation, name);
	if (!(file instanceof TFile)) {
		generation.byName.set(name, undefined);
		return undefined;
	}
	const cached = app.metadataCache.getFileCache(file);
	if (cached) generation.byName.set(name, cached.frontmatter);
	return cached?.frontmatter;
}

/** Every FileClass in the folder: the vault scan, kept for the generation. */
function classesIn(app: App, generation: Generation): readonly DeclaredClass[] {
	if (generation.classes) return generation.classes;
	const prefix = `${generation.folder}/`;
	const caches = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(prefix))
		.map((file) => ({ name: file.basename, cache: app.metadataCache.getFileCache(file) }));
	const classes = caches.map(({ name, cache }) => ({ name, frontmatter: cache?.frontmatter ?? {} }));
	if (caches.every(({ cache }) => cache !== null)) generation.classes = classes;
	return classes;
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
	classes: readonly DeclaredClass[],
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
