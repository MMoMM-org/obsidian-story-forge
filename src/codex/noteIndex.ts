/**
 * noteIndex — the vault-facing half of collection resolution.
 *
 * `collectionResolver.ts` shipped **pure** (T1.1): it takes an injected
 * `IndexedNote[] {path, tags}` and returns a `CollectionResolution`, so the
 * selection rules are unit-testable without a vault. That left two adaptation
 * jobs for the first phase that actually has an `App`, and this module is both
 * of them — deliberately *beside* the pure layer, never inside it:
 *
 *   1. **build the note index** from `metadataCache` (path + normalized tags),
 *      keeping it current as notes change;
 *   2. **adapt `path` → `TFile`**, which card rendering needs because a card
 *      reads the file and its frontmatter, not a path string.
 *
 * Freshness is invalidate-on-event, rebuild-on-read: the metadataCache events
 * only flip a dirty flag, so a burst of vault activity costs one rebuild at the
 * next read rather than one per event. Every subscription is handed to the
 * caller's `registerEvent` seam (Obsidian's `Component.registerEvent`) so unload
 * releases it — a raw `on()` here would outlive the view (CON-4).
 *
 * Tags are normalized to the resolver's vocabulary: no leading `#`, so a note
 * carrying `#canon/character` (inline) or `tags: [canon/character]`
 * (frontmatter) both index as `canon/character`. `getAllTags` is Obsidian's own
 * combiner for those two sources — the same call `ScopingService.classify`
 * already makes.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — Phase Context (note index / TFile adaptation)
 * @ref src/codex/collectionResolver.ts — the pure consumer of `IndexedNote[]`
 * @ref SDD/CON-8 — no `any`; unknown external shapes narrowed
 */

import { TFile, getAllTags, type App, type EventRef } from "obsidian";
import type { IndexedNote } from "./collectionResolver";

/** The `Component.registerEvent` seam — every subscription must go through it (CON-4). */
export type RegisterEventSeam = (ref: EventRef) => void;

/** The vault-backed index a Codex host reads. Both members are always current. */
export interface CodexNoteIndex {
	/** Every markdown note in the vault, with its normalized tags. */
	notes(): readonly IndexedNote[];
	/** The `TFile` behind a resolved note path, or `null` when it no longer exists. */
	fileFor(path: string): TFile | null;
}

/** Strip Obsidian's leading `#` so index tags match a collection's configured tag. */
function normalizeTag(tag: string): string {
	return tag.startsWith("#") ? tag.slice(1) : tag;
}

/**
 * Create a note index over `app`, kept current for the lifetime of the host.
 *
 * `registerEvent` is the host's `Component.registerEvent` (pass it bound, e.g.
 * `(ref) => { this.registerEvent(ref); }`): the three metadataCache
 * subscriptions this makes are released when the host unloads.
 */
export function createNoteIndex(app: App, registerEvent: RegisterEventSeam): CodexNoteIndex {
	let notes: IndexedNote[] = [];
	let byPath = new Map<string, TFile>();
	let dirty = true;

	const invalidate = (): void => {
		dirty = true;
	};

	// "changed" covers create + edit (it fires once the file is indexed);
	// "deleted" covers removal; "resolved" covers the initial bulk index and
	// any later re-index Obsidian performs on its own.
	registerEvent(app.metadataCache.on("changed", invalidate));
	registerEvent(app.metadataCache.on("deleted", invalidate));
	registerEvent(app.metadataCache.on("resolved", invalidate));

	const rebuild = (): void => {
		const nextNotes: IndexedNote[] = [];
		const nextByPath = new Map<string, TFile>();
		for (const file of app.vault.getMarkdownFiles()) {
			const cache = app.metadataCache.getFileCache(file);
			const tags = cache ? (getAllTags(cache) ?? []).map(normalizeTag) : [];
			nextNotes.push({ path: file.path, tags });
			nextByPath.set(file.path, file);
		}
		notes = nextNotes;
		byPath = nextByPath;
		dirty = false;
	};

	const ensureFresh = (): void => {
		if (dirty) rebuild();
	};

	return {
		notes(): readonly IndexedNote[] {
			ensureFresh();
			return notes;
		},
		fileFor(path: string): TFile | null {
			ensureFresh();
			const known = byPath.get(path);
			if (known) return known;
			// Fall back to the vault for a path the index has not caught up with
			// (e.g. a note created between two reads of the same render pass).
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile ? file : null;
		},
	};
}
