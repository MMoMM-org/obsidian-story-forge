/**
 * cardRegistry — the `CardRenderer` contract, the normalised entry a Card
 * reads, and the registry that resolves a Card id (ADR-30).
 *
 * **One Card, two backends.** A Card is drawn once and registered twice: as a
 * Bases view type (so it can appear inside a user's own `.base`, ADR-0001) and
 * as a native renderer (so the Codex still works with Bases absent or on
 * mobile, CON-3/CON-9). What makes that possible is that a Card never touches
 * either backend — it reads a `CardEntry`, and each backend has a thin adapter
 * that produces one. The alternative the ADR rejected, Hero-native plus the
 * rest Bases-only, would recreate exactly the per-backend divergence the panel
 * renderers already suffer from.
 *
 * **Resolution is total.** `resolve()` always returns a Card: the registry is
 * constructed *around* its default, so an id from settings that no longer
 * matches anything (a Card the user removed, a renamed built-in) degrades to
 * the default rather than rendering an empty grid.
 *
 * **Lookup is by id, at render time — never a captured reference.** The Bases
 * seam must call `registerBasesView` exactly once at plugin load
 * (`BasesAdapter` caches the boolean it returns in a `WeakMap` for precisely
 * this reason, spec 005 ADR-8), which is *before* the registry is populated. A
 * view factory that captured a `CardRenderer` at registration time would
 * therefore capture nothing. It must hold the registry and call `resolve(id)`
 * when it draws.
 *
 * **No Bases typings cross this file** (CON-6). `BasesEntryLike` states the two
 * members the adapter uses, structurally; the real `BasesEntry` satisfies it,
 * and only `src/bases/` ever passes one.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-30, CON-3, CON-6, CON-9
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { stringifyFieldValue } from "panel/components";

// ---------------------------------------------------------------------------
// The normalised entry
// ---------------------------------------------------------------------------

/**
 * One property as a Card sees it, whichever backend produced it.
 *
 * `present` is the distinction F4 rests on: a property that *exists* renders
 * normally even when blank (`null`, `""` and `[]` are deliberately not told
 * apart), while a property that is **absent** is a different case the Card is
 * free to mark. Both `text` and `items` are always safe to place in the DOM —
 * an absent or unrepresentable value yields `""` and `[]`, never `undefined`.
 */
export interface CardField {
	/** Whether the backend could observe this property on the note at all. */
	readonly present: boolean;
	/** Display form. `""` when absent or blank — never the string `undefined`. */
	readonly text: string;
	/**
	 * `text` read as a list, for relation pills. A native array is used
	 * element-wise; the Bases backend can only re-read `Value.toString()`, so it
	 * splits the comma-joined display form. The two agree for every value whose
	 * elements contain no comma — Cards must not use `items` for free text.
	 */
	readonly items: readonly string[];
}

/** The single absent-field value. Frozen: shared by every miss. */
const ABSENT_FIELD: CardField = Object.freeze({
	present: false,
	text: "",
	items: Object.freeze([]),
});

/**
 * A note as a Card reads it. Fields are read lazily by id, because a Card —
 * especially an imported one — decides for itself which properties it wants,
 * and the Bases backend charges per property read.
 */
export interface CardEntry {
	/** Vault-relative path. The identity the host resolves back to a `TFile`. */
	readonly path: string;
	/** Display name: the file's basename, sans extension. */
	readonly name: string;
	/** Read one property. Never throws; an unknown id is an absent field. */
	field(id: string): CardField;
}

// ---------------------------------------------------------------------------
// The renderer contract
// ---------------------------------------------------------------------------

/**
 * What the host lends a Card for the duration of one render.
 *
 * `nameEl` is not a convenience: the F2 precedence AC ("clicking the name wins
 * over the surrounding card body") holds purely because the `name` marker nests
 * *inside* the `cardBody` marker, and the host is the only party that knows
 * that vocabulary. Handing Cards a builder keeps every Card — ours and an
 * imported one — correct by construction, with no marker attribute in any Card.
 */
export interface CardRenderDeps {
	/** Workbench density (S95). Same markup, tighter spacing. */
	readonly compact: boolean;
	/** Build the entry's name element, already carrying the host's `name` marker. */
	nameEl(entry: CardEntry): HTMLElement;
	/**
	 * Turn a raw frontmatter image path into something an `<img src>` can use.
	 *
	 * `portrait` and `image` arrive as plain path strings, while `portraitTile` /
	 * `imageTile` take an already-resolved URL — and resolving needs the vault. A
	 * Card reaching for `App` to close that gap would break the same seam
	 * discipline `nameEl` exists to enforce, so the host injects the resolver.
	 *
	 * Total: empty input yields `""` so the Card can draw its monogram fallback,
	 * protocol URLs pass through, vault paths resolve, and an unresolvable path
	 * comes back unchanged (`createAssetResolver`). `PanelDeps.resolveAsset` is
	 * the stricter sibling — it gives `""` for an unresolvable link (T6.2).
	 */
	resolveAsset(raw: string): string;
}

/**
 * A Card: how one entry is drawn. Written once, served to both backends.
 *
 * `render` appends into `el` — the host owns that element, stamps the card-body
 * marker on it and empties it between renders.
 */
export interface CardRenderer {
	/** Stable id — persisted per collection (`cardByCollection`) and used by Bases view types. */
	readonly id: string;
	/** Sentence-case selector label (obsidianmd UI-text rule). */
	readonly label: string;
	render(entry: CardEntry, el: HTMLElement, deps: CardRenderDeps): void;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** The Cards a host can draw with, and the total resolution of an id to one. */
export interface CardRegistry {
	/** The id `resolve` degrades to. Registered at construction, never absent. */
	readonly defaultId: string;
	/**
	 * Add a Card. Returns `false` and changes nothing when the id is taken —
	 * first registration wins, so an imported Card cannot quietly shadow a
	 * built-in (the built-ins register at load, before any import).
	 */
	register(renderer: CardRenderer): boolean;
	/** The Card for `id`, or the default when `id` is unknown, `null` or absent. */
	resolve(id: string | null | undefined): CardRenderer;
	/** Every registered Card: the default first, then registration order. */
	list(): readonly CardRenderer[];
}

/**
 * Create a registry around its default Card.
 *
 * Taking the default as a constructor argument (rather than a `setDefault`
 * call) is what makes `resolve` total: there is no window in which the registry
 * exists without one.
 */
export function createCardRegistry(defaultRenderer: CardRenderer): CardRegistry {
	const byId = new Map<string, CardRenderer>([[defaultRenderer.id, defaultRenderer]]);

	return {
		defaultId: defaultRenderer.id,

		register(renderer: CardRenderer): boolean {
			if (byId.has(renderer.id)) return false;
			byId.set(renderer.id, renderer);
			return true;
		},

		resolve(id: string | null | undefined): CardRenderer {
			const found = id == null ? undefined : byId.get(id);
			return found ?? defaultRenderer;
		},

		list(): readonly CardRenderer[] {
			return [...byId.values()];
		},
	};
}

// ---------------------------------------------------------------------------
// Adapter: the native backend (frontmatter)
// ---------------------------------------------------------------------------

/**
 * Adapt a note's frontmatter to a `CardEntry` — the CON-3 fallback path, used
 * whenever Bases is absent, disabled, or simply not the surface in play.
 *
 * Presence is `hasOwnProperty`, which is the strongest answer available: the
 * key is in the frontmatter or it is not, independent of its value. Pass the
 * record from `metadataCache.getFileCache(file)?.frontmatter`; `null` or
 * `undefined` (a note with no frontmatter) makes every field absent.
 */
export function nativeCardEntry(
	path: string,
	frontmatter?: Record<string, unknown> | null,
): CardEntry {
	const properties = frontmatter ?? {};

	return {
		path,
		name: basenameOf(path),
		field(id: string): CardField {
			if (!Object.prototype.hasOwnProperty.call(properties, id)) return ABSENT_FIELD;
			const raw: unknown = properties[id];
			const text = stringifyFieldValue(raw);
			return { present: true, text, items: itemsOf(raw, text) };
		},
	};
}

// ---------------------------------------------------------------------------
// Adapter: the Bases backend
// ---------------------------------------------------------------------------

/**
 * The two members of Bases' `BasesEntry` a Card entry is built from
 * (obsidian.d.ts: `file: TFile`, `getValue(propertyId): Value | null`), stated
 * structurally so this module imports no Bases typings (CON-6). A real
 * `BasesEntry` satisfies it; only `src/bases/` ever passes one.
 */
export interface BasesEntryLike {
	readonly file: { readonly path: string };
	/**
	 * Bases types this as `BasesPropertyId` (`${type}.${name}`); the runtime
	 * resolves a bare property name too, which is what `CodexBasesView`'s
	 * existing mapping already relies on.
	 */
	getValue(propertyId: string): { toString(): string } | null;
}

/**
 * Adapt a Bases entry to a `CardEntry`.
 *
 * **The blank-vs-absent gap, closed here (T4.5).** `getValue` returns `null`
 * both for a property that is absent and for one that exists with no value,
 * and `Value` exposes nothing else to tell them apart — so `getValue` alone
 * cannot answer presence. `frontmatter` is the ground truth instead: pass
 * `metadataCache.getFileCache(entry.file)?.frontmatter ?? null` (the caller
 * holds the `App` this module deliberately does not, CON-6) and presence
 * becomes `hasOwnProperty` on it — the exact same rule `nativeCardEntry` uses,
 * so the two backends agree. `null` means the note has no frontmatter block at
 * all, matching `nativeCardEntry`'s contract for the same input. Display text
 * still comes from `Value.toString()`, never from the frontmatter's own value
 * (`Value` may format it — dates, links — differently than the raw property).
 *
 * The comma-split documented on `CardField.items` has a different, narrower
 * cause: `toString()` is the only window this API gives onto a value's
 * *shape*, so a list still has to be inferred from the display form even once
 * presence is settled by `frontmatter`.
 *
 * Never hold the returned entry across an `onDataUpdated`: the Bases runtime
 * recreates every `BasesEntry`, so a retained adapter is a stale reference
 * (ADR-2).
 *
 * @param entry       the Bases-shaped source (real `BasesEntry` or a fixture)
 * @param frontmatter ground-truth presence for `entry.file`, or `null` when
 *                    the note has no frontmatter block — every field is then
 *                    absent, matching `nativeCardEntry(path, null)`
 */
export function basesCardEntry(
	entry: BasesEntryLike,
	frontmatter: Record<string, unknown> | null,
): CardEntry {
	const path = entry.file.path;

	return {
		path,
		name: basenameOf(path),
		field(id: string): CardField {
			if (frontmatter == null || !Object.prototype.hasOwnProperty.call(frontmatter, id)) {
				return ABSENT_FIELD;
			}
			const value = entry.getValue(id);
			// `toString()` is the only documented accessor on `Value`. It is typed
			// `string`, but this is a foreign runtime boundary — coercing through
			// the same helper the native side uses keeps `undefined` out of the DOM
			// (CON-8) and makes the two backends agree on display form. `value` can
			// still be `null` here (a present-but-blank property) — that renders as
			// `""`, exactly like a blank string on the native backend.
			const text = value == null ? "" : stringifyFieldValue(value.toString());
			return { present: true, text, items: splitDisplayList(text) };
		},
	};
}

// ---------------------------------------------------------------------------
// Shared normalisation
// ---------------------------------------------------------------------------

/** List form of a value: an array element-wise, anything else read as display text. */
function itemsOf(raw: unknown, text: string): readonly string[] {
	if (Array.isArray(raw)) {
		return (raw as unknown[]).map((item) => stringifyFieldValue(item).trim()).filter(isNotEmpty);
	}
	return splitDisplayList(text);
}

/** Read a display string as the comma-separated list `stringifyFieldValue` produces. */
function splitDisplayList(text: string): readonly string[] {
	return text.split(",").map((part) => part.trim()).filter(isNotEmpty);
}

function isNotEmpty(value: string): boolean {
	return value.length > 0;
}

/** Display name for a vault path: basename without the markdown extension. */
function basenameOf(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}
