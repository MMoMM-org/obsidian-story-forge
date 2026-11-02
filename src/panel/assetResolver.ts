/**
 * assetResolver — the one place a raw frontmatter image path becomes something
 * an `<img src>` can use.
 *
 * `schema/character.json`'s `portrait` and `location`/`object`'s `image` are
 * `media` fields holding a **wikilink** (legacy notes may still hold a path or URL); every component that draws them
 * (`portraitTile`, `imageTile`, and the Codex Cards) takes an already-resolved
 * URL. Resolution needs the vault, so it is injected as a seam
 * (`PanelDeps.resolveAsset`, `CardRenderDeps.resolveAsset`) rather than reached
 * for — the same discipline that keeps navigation out of renderers.
 *
 * It lives here, and not copied into each host, because the panel and the Codex
 * draw the *same* frontmatter field: two implementations would be two answers
 * to "is this a vault path or a URL", and the divergence would only show up as
 * a broken image on one surface. Extracted from `NativeScopingEngine`
 * (T4.2 review), which was its sole owner and is now its first caller.
 *
 * Home note: this is a vault utility rather than a panel concern, but it is
 * `PanelDeps.resolveAsset`'s contract of record and `src/codex/` already
 * imports `panel/components` and `panel/kindFields` on the same precedent. If a
 * fourth helper migrates this way, they belong together in a neutral module.
 *
 * @ref src/panel/renderPanel.ts — PanelDeps.resolveAsset, the documented contract
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-30 (one Card, two backends)
 */

import { TFile, type App } from "obsidian";

/** Anything already carrying a scheme is a URL, not a vault path. */
const PROTOCOL_RE = /^(https?:|data:|app:|blob:)/;

/** `[[target]]` or the embed form `![[target]]`, with optional `|alias` / `#heading`. */
const WIKILINK_RE = /^!?\[\[(.*)\]\]$/;

/** `a/b.png|alias#x` → `a/b.png`. */
export function stripLinkSuffix(inner: string): string {
	return (inner.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
}

/**
 * The link target of a wikilink value (`[[a/b.png|alias]]`, `![[a/b.png]]`), or
 * `null` when `raw` is not a wikilink — a bare path or URL.
 *
 * The one place a `Media` field's stored form is parsed: the panel, the Codex
 * Cards (both backends) and the editor's Media control all share it.
 */
export function wikilinkTarget(raw: string): string | null {
	const inner = WIKILINK_RE.exec(raw.trim())?.[1];
	return inner === undefined ? null : stripLinkSuffix(inner);
}

/**
 * Build the asset resolver for one source note.
 *
 * The returned function is total and never throws:
 * - empty or whitespace-only input → `""` (the caller draws its fallback);
 * - a wikilink (`[[mara.png]]`, what a `Media` field stores) → resolved by its
 *   target, exactly as below; a bare path or URL (legacy values) still works;
 * - a protocol URL (`https:`, `http:`, `data:`, `app:`, `blob:`) → unchanged;
 * - a vault path, or a bare name Obsidian can resolve as a link from
 *   `sourcePath` → the vault's resource URL;
 * - anything else → returned unchanged, so a mistyped path shows as a broken
 *   image the user can diagnose rather than silently vanishing.
 *
 * @param app         the vault and metadata cache to resolve against
 * @param sourcePath  the note the path was read from — link resolution is
 *                    relative to it, exactly as a wikilink in that note is
 */
export function createAssetResolver(app: App, sourcePath: string): (src: string) => string {
	return (input: string): string => {
		// A Media field stores `[[mara.png]]`; link resolution wants `mara.png`.
		const src = wikilinkTarget(input) ?? input;
		if (!src.trim()) return "";
		if (PROTOCOL_RE.test(src)) return src;

		// Try the literal vault path first.
		const byPath = app.vault.getAbstractFileByPath(src);
		if (byPath instanceof TFile) {
			return app.vault.getResourcePath(byPath);
		}

		// Fall back to link resolution, which finds a bare file name.
		const byLink = app.metadataCache.getFirstLinkpathDest(src, sourcePath);
		if (byLink) {
			return app.vault.getResourcePath(byLink);
		}

		return src;
	};
}

/**
 * The resolver for a **link target** (`mara.png`, already stripped of
 * `[[ ]]`): like `createAssetResolver`, but total in the other direction too —
 * a target that resolves to nothing returns `""` rather than itself.
 *
 * `createAssetResolver` hands unresolvable input back so a tile shows a broken
 * image the user can diagnose. The editor's Media control does the opposite on
 * purpose: it shows the stored link as text beside the preview, so the
 * diagnosis is already on screen and the preview can fall back to the monogram.
 */
export function createLinkedImageResolver(app: App, sourcePath: string): (target: string) => string {
	const resolve = createAssetResolver(app, sourcePath);
	return (target: string): string => {
		const out = resolve(target);
		return out === target && !PROTOCOL_RE.test(target) ? "" : out;
	};
}
