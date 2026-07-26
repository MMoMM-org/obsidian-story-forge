/**
 * sceneMapper — the impure adapter that maps a scene `TFile` to a pure `SceneRow`.
 *
 * Kept separate from `workspaceModel` (which stays pure/DOM-free) because this reads
 * `metadataCache`: frontmatter for flat fields, frontmatterLinks for relations, and a
 * second lookup to resolve the beat note's display name (alias/title) — the source of
 * the Timeline act label (ADR-11). Never throws; missing data → ""/[]/null.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-11
 * @ref schema/scene.json — act, order, storyDay, when, status, wordcount, pov, location, characters, plotlines, beat
 */

import type { App, TFile } from "obsidian";
import type { Link, SceneRow } from "./workspaceModel";

function fmNumber(v: unknown): number | null {
	return typeof v === "number" ? v : null;
}

function fmString(v: unknown): string {
	return typeof v === "string" ? v : "";
}

/** Strip a leading emoji / punctuation run from a beat title (e.g. "🎬 Foo" → "Foo"). */
function stripLeadingGlyph(title: string): string {
	return title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/** Map a scene note to a render-ready SceneRow, resolving relation basenames + the beat name. */
export function mapSceneRow(app: App, file: TFile): SceneRow {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter ?? {};
	const links = cache?.frontmatterLinks ?? [];

	const linkByKey = (key: string): string | null =>
		links.find((l) => l.key === key)?.link ?? null;
	const linksByField = (field: string): string[] =>
		links.filter((l) => l.key === field || l.key.startsWith(`${field}.`)).map((l) => l.link);

	// Resolve a link text to a {name, path} Link. Null only when there is no link text;
	// an unresolved link keeps its text as the name with an empty path (not clickable).
	const resolveLink = (linktext: string | null): Link | null => {
		if (!linktext) return null;
		const dest = app.metadataCache.getFirstLinkpathDest(linktext, file.path);
		return dest ? { name: dest.basename, path: dest.path } : { name: linktext, path: "" };
	};

	const beat = linkByKey("beat") ?? "";
	const beatDest = beat !== "" ? app.metadataCache.getFirstLinkpathDest(beat, file.path) : null;
	const plotlineLinks = linksByField("plotlines");

	return {
		file,
		title: fmString(fm["title"]) || file.basename,
		act: fmNumber(fm["act"]),
		order: fmNumber(fm["order"]),
		storyDay: fmNumber(fm["storyDay"]),
		when: fmString(fm["when"]),
		status: fmString(fm["status"]),
		pov: resolveLink(linkByKey("pov")),
		location: resolveLink(linkByKey("location")),
		characters: linksByField("characters").flatMap((t) => resolveLink(t) ?? []),
		plotline: plotlineLinks.length > 0 ? resolveLink(plotlineLinks[0]!) : null,
		plotlines: plotlineLinks, // raw; the model resolves/strips these
		beat,
		beatName: beatDest ? beatDisplayName(app, beatDest) : "",
		beatPath: beatDest?.path ?? "",
		wordcount: fmNumber(fm["wordcount"]),
	};
}

/** A beat note's display name: alias first, else the emoji-stripped title. */
function beatDisplayName(app: App, dest: TFile): string {
	const fm = app.metadataCache.getFileCache(dest)?.frontmatter ?? {};
	const aliases: unknown = fm["aliases"];
	if (Array.isArray(aliases) && typeof aliases[0] === "string" && aliases[0] !== "") {
		return aliases[0];
	}
	const title = fmString(fm["title"]) || dest.basename;
	return stripLeadingGlyph(title);
}
