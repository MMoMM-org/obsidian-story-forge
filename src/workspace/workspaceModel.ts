/**
 * workspaceModel — pure sort/group models for the M5 declarative workspace views.
 *
 * No DOM, no Obsidian runtime beyond a `TFile` carried on each row (link resolution
 * is injected). `SceneRow[]` in, `Group[]` out — fully deterministic and unit-tested.
 *
 * Timeline: order by coalesce(storyDay, order) ascending, tie-broken by order then
 * title; group by act, with a trailing "No act" bucket. Never drops a scene.
 * Plotlines: fan each scene into one group per plotline link; empty → "Unassigned";
 * unresolved link → its own flagged group (ADR-7).
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — Interface Specifications, ADR-5/ADR-7
 * @ref schema/scene.json — act, order, storyDay, when, plotlines, status
 */

import type { TFile } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A resolved relation target: display name + vault path (`path: ""` = unresolved, not clickable). */
export interface Link {
	name: string;
	path: string;
}

/** A plain, Bases-free render row mapped from a scene note. */
export interface SceneRow {
	file: TFile;
	title: string;
	act: number | null;
	order: number | null;
	storyDay: number | null;
	when: string;
	status: string;
	/** Point-of-view character, or null when absent. */
	pov: Link | null;
	/** Location, or null when absent. */
	location: Link | null;
	/** Characters present in the scene. */
	characters: Link[];
	/** Primary plotline (first) — drives the rail dot's colour + drill. */
	plotline: Link | null;
	/** Raw plotline link targets (may be `[[wrapped]]` and/or unresolved). */
	plotlines: string[];
	/** Raw `beat` link text ("" when empty). */
	beat: string;
	/** Resolved beat-note display name (alias/title), or "" when empty/unresolved. */
	beatName: string;
	/** Resolved beat-note path, or "" when empty/unresolved. */
	beatPath: string;
	wordcount: number | null;
}

export type GroupKind = "act" | "plotline" | "unassigned" | "no-act" | "unresolved";

export interface Group {
	key: string;
	label: string;
	kind: GroupKind;
	scenes: SceneRow[];
}

/** Resolve a plotline link target to its canonical note (basename), or null if unresolved. */
export type LinkResolver = (linktext: string) => { basename: string } | null;

const INF = Number.POSITIVE_INFINITY;
const WIKILINK = /^\[\[(.+?)\]\]$/;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Sort key: primary = storyDay ?? order ?? +∞ (unplaced sort last, never dropped);
 * tiebreak = order ?? +∞; final tiebreak = title (stable). `when` is never consulted.
 */
export function compareTimeline(a: SceneRow, b: SceneRow): number {
	const ak = a.storyDay ?? a.order ?? INF;
	const bk = b.storyDay ?? b.order ?? INF;
	if (ak !== bk) return ak - bk;
	const ao = a.order ?? INF;
	const bo = b.order ?? INF;
	if (ao !== bo) return ao - bo;
	return a.title.localeCompare(b.title);
}

/** Order scenes chronologically and group them by act (with a trailing "No act" bucket). */
export function timelineModel(rows: SceneRow[]): Group[] {
	const sorted = [...rows].sort(compareTimeline);

	const byAct = new Map<number, SceneRow[]>();
	const noAct: SceneRow[] = [];
	for (const r of sorted) {
		if (r.act === null) { noAct.push(r); continue; }
		const bucket = byAct.get(r.act) ?? [];
		bucket.push(r);
		byAct.set(r.act, bucket);
	}

	const groups: Group[] = [];
	for (const act of [...byAct.keys()].sort((x, y) => x - y)) {
		const scenes = byAct.get(act)!;
		groups.push({ key: `act:${act}`, label: actLabel(act, scenes), kind: "act", scenes });
	}
	if (noAct.length > 0) {
		groups.push({ key: "no-act", label: "No act", kind: "no-act", scenes: noAct });
	}
	return groups;
}

/**
 * Act divider label. Acts have no name of their own; the name is the beat the act's
 * scenes share (`scene.beat` → beat-note alias). Returns `Act N · <beat>` when the
 * act's scenes agree on a single non-empty beat, else `Act N` (ADR-11).
 */
export function actLabel(act: number | null, scenes: SceneRow[]): string {
	if (act === null) return "No act";
	const names = new Set(scenes.map((s) => s.beatName).filter((n) => n !== ""));
	return names.size === 1 ? `Act ${act} · ${[...names][0]!}` : `Act ${act}`;
}

/**
 * The beat shared by an act's scenes (same "one shared beat" rule as `actLabel`), as a
 * drillable Link. Returns null when the scenes disagree on the beat or have none; the
 * `path` may be "" when the beat note is unresolved (name shown, not clickable).
 */
export function actBeatLink(scenes: SceneRow[]): Link | null {
	const names = new Set(scenes.map((s) => s.beatName).filter((n) => n !== ""));
	if (names.size !== 1) return null;
	const name = [...names][0]!;
	const withPath = scenes.find((s) => s.beatName === name && s.beatPath !== "");
	return { name, path: withPath?.beatPath ?? "" };
}

// ---------------------------------------------------------------------------
// Plotlines
// ---------------------------------------------------------------------------

/** Strip `[[ ]]` from a link target, tolerating surrounding whitespace. */
export function stripLink(raw: string): string {
	const t = raw.trim();
	return WIKILINK.exec(t)?.[1] ?? t;
}

/**
 * Group scenes by the plotlines they advance. A scene on N plotlines appears under
 * each; scenes with no plotline collect in a trailing "Unassigned" group; a scene
 * whose plotline link does not resolve gets its own flagged "unresolved" group.
 * Order: plotline groups (by name), then unresolved groups (by name), Unassigned last.
 */
export function plotlineModel(rows: SceneRow[], resolve: LinkResolver): Group[] {
	const byPlotline = new Map<string, SceneRow[]>();
	const byUnresolved = new Map<string, SceneRow[]>();
	const unassigned: SceneRow[] = [];

	for (const r of rows) {
		if (r.plotlines.length === 0) { unassigned.push(r); continue; }
		for (const raw of r.plotlines) {
			const text = stripLink(raw);
			const dest = resolve(text);
			if (dest) {
				const bucket = byPlotline.get(dest.basename) ?? [];
				bucket.push(r);
				byPlotline.set(dest.basename, bucket);
			} else {
				const bucket = byUnresolved.get(text) ?? [];
				bucket.push(r);
				byUnresolved.set(text, bucket);
			}
		}
	}

	const groups: Group[] = [];
	for (const label of [...byPlotline.keys()].sort((a, b) => a.localeCompare(b))) {
		groups.push({ key: `plotline:${label}`, label, kind: "plotline", scenes: byPlotline.get(label)! });
	}
	for (const text of [...byUnresolved.keys()].sort((a, b) => a.localeCompare(b))) {
		groups.push({ key: `unresolved:${text}`, label: text, kind: "unresolved", scenes: byUnresolved.get(text)! });
	}
	if (unassigned.length > 0) {
		groups.push({ key: "unassigned", label: "Unassigned", kind: "unassigned", scenes: unassigned });
	}
	return groups;
}

// ---------------------------------------------------------------------------
// Derivations (color, status)
// ---------------------------------------------------------------------------

/**
 * Stable per-plotline palette (mockup hues). Plotlines have no `color` field, so the
 * color is derived deterministically from the name — same name → same color (ADR-12).
 */
const PLOTLINE_PALETTE: readonly string[] = [
	"#d9a441", "#5b8bd0", "#b06a86", "#6ac47a",
	"#8a7cf0", "#4bb6ab", "#e0a34a", "#c0607f",
];

/** Deterministic color for a plotline name (FNV-ish hash → fixed palette). */
export function plotlineColor(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
	}
	return PLOTLINE_PALETTE[h % PLOTLINE_PALETTE.length]!;
}

/** Count scenes by `status` (empty status counted under the "" key). For the Navigator progress bar. */
export function statusTally(rows: SceneRow[]): Record<string, number> {
	const tally: Record<string, number> = {};
	for (const r of rows) {
		tally[r.status] = (tally[r.status] ?? 0) + 1;
	}
	return tally;
}
