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

export type GroupKind = "act" | "plotline" | "pov" | "location" | "status" | "unassigned" | "no-act" | "unresolved";

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

// ---------------------------------------------------------------------------
// Kanban (M6 — T1.1)
// ---------------------------------------------------------------------------

/**
 * Sentinel returned by `insertOrder` when the gap between neighbours is exactly
 * 1 (no integer exists between them). The caller must renumber the column
 * (rewrite `order` as 10, 20, 30, …) before retrying insertion (ADR-17).
 *
 * `null` is chosen because it is type-safe with the `number | null` return union
 * and cannot be confused with a valid order value.
 */
export const RENUMBER: null = null;

/**
 * Compute a sparse integer `order` value for a card inserted between two
 * neighbours. Rules (ADR-17):
 *
 * | before | after | gap | result          |
 * |--------|-------|-----|-----------------|
 * | n      | m     | ≥2  | floor((n+m)/2)  |
 * | n      | m     | 1   | RENUMBER (null) |
 * | n      | null  | —   | n + 10          |
 * | null   | m     | —   | m - 10          |
 * | null   | null  | —   | 10              |
 *
 * Returns `null` (RENUMBER) to signal the column must be renumbered.
 * Returns `number` in all other cases.
 *
 * @precondition Callers should pass `before < after` for a real insertion.
 * Passing equal or inverted values (before ≥ after) returns RENUMBER (null)
 * and the column must be renumbered before retrying.
 */
export function insertOrder(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return 10;
	if (before === null) return Math.max(0, after! - 10);
	if (after === null) return before + 10;
	const gap = after - before;
	if (gap <= 1) return RENUMBER;
	return Math.floor((before + after) / 2);
}

/**
 * Group scenes into Kanban columns, one per supplied status value.
 * Scenes are sorted within each column by `order` ascending (null order sorts
 * last), tiebroken by title. Scenes whose `status` is absent or not in
 * `statuses` are collected in a trailing neutral group (key `"no-status"`,
 * kind `"unassigned"`). No scene is ever dropped. Empty status columns are
 * still emitted (no scenes, just the column header).
 */
export function kanbanModel(rows: SceneRow[], statuses: string[]): Group[] {
	// Build a column map keyed by status, preserving input order.
	const columns = new Map<string, SceneRow[]>();
	for (const s of statuses) {
		columns.set(s, []);
	}
	const neutral: SceneRow[] = [];

	for (const r of rows) {
		if (statuses.includes(r.status)) {
			columns.get(r.status)!.push(r);
		} else {
			neutral.push(r);
		}
	}

	// Sort within each column by order asc, tiebreak by title.
	function sortScenes(scenes: SceneRow[]): SceneRow[] {
		return [...scenes].sort((a, b) => {
			const ao = a.order ?? INF;
			const bo = b.order ?? INF;
			if (ao !== bo) return ao - bo;
			return a.title.localeCompare(b.title);
		});
	}

	const groups: Group[] = [];
	for (const s of statuses) {
		groups.push({
			key: `status:${s}`,
			label: s,
			kind: "status",
			scenes: sortScenes(columns.get(s)!),
		});
	}

	if (neutral.length > 0) {
		groups.push({
			key: "no-status",
			label: "No status",
			kind: "unassigned",
			scenes: sortScenes(neutral),
		});
	}

	return groups;
}

// ---------------------------------------------------------------------------
// Plotgrid (M6 — T1.2)
// ---------------------------------------------------------------------------

/**
 * Matrix view: plotline axis × scene axis + membership test.
 * Plotlines are ordered by resolved name (resolved first, unresolved after).
 * Unresolved plotlines have `path: ""` (ADR-7 convention, same as Link).
 */
export interface PlotgridModel {
	/** Plotline axis (resolved by name, then unresolved). Unresolved entries have `path: ""`. */
	plotlines: Link[];
	/** Scene axis in input order. */
	scenes: SceneRow[];
	/**
	 * Returns true iff the scene at `sceneIdx` belongs to `plotline`.
	 * Matches by `Link.name` (resolved name or unresolved raw text).
	 */
	has(sceneIdx: number, plotline: Link): boolean;
}

/**
 * Build the plotgrid matrix. Plotlines are the distinct resolved plotlines (by
 * resolved basename) plus any unresolved entries (flagged via `path: ""`). The
 * `has(i, pl)` method tests membership by name.
 */
export function plotgridModel(rows: SceneRow[], resolve: LinkResolver): PlotgridModel {
	// Collect plotlines in name order; track scene membership.
	const resolvedNames = new Map<string, string>(); // basename → path (path == "" means unresolved)
	// Use insertion order to track first-seen order; re-sort at end.
	const plotlineOrder: string[] = []; // names in encounter order (resolved names first)

	// membership[sceneIdx] = Set of plotline names for that scene
	const membership: Set<string>[] = rows.map(() => new Set<string>());

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i]!;
		for (const raw of r.plotlines) {
			const text = stripLink(raw);
			const dest = resolve(text);
			const name = dest ? dest.basename : text;
			const path = dest ? name : ""; // resolved → name as path key; unresolved → ""
			if (!resolvedNames.has(name)) {
				resolvedNames.set(name, path);
				plotlineOrder.push(name);
			}
			membership[i]!.add(name);
		}
	}

	// Sort: resolved (path !== "") by name, then unresolved (path === "") by name.
	const resolvedList = plotlineOrder
		.filter((n) => resolvedNames.get(n) !== "")
		.sort((a, b) => a.localeCompare(b));
	const unresolvedList = plotlineOrder
		.filter((n) => resolvedNames.get(n) === "")
		.sort((a, b) => a.localeCompare(b));

	const plotlines: Link[] = [
		...resolvedList.map((n) => ({ name: n, path: n })),
		...unresolvedList.map((n) => ({ name: n, path: "" })),
	];

	return {
		plotlines,
		scenes: rows,
		has(sceneIdx: number, plotline: Link): boolean {
			return membership[sceneIdx]?.has(plotline.name) ?? false;
		},
	};
}

// ---------------------------------------------------------------------------
// Swimlane (M6 — T1.4)
// ---------------------------------------------------------------------------

/** The three grouping dimensions for the swimlane view (ADR-20). */
export type SwimlaneKey = "pov" | "location" | "plotline";

/** Labels for neutral/unassigned swimlane buckets per key. */
const NEUTRAL_LANE: Record<SwimlaneKey, string> = {
	pov: "No POV",
	location: "No location",
	plotline: "Unassigned",
};

/**
 * Group scenes into swimlane lanes by `key`. Rules:
 * - `"pov"` / `"location"`: one lane per distinct resolved name; unresolved links
 *   get their own flagged lane (path ""); scenes with null field → neutral bucket.
 * - `"plotline"`: multi-plotline scenes fan out into EACH of their plotline lanes
 *   (same as plotlineModel); unresolved → flagged lane; no plotlines → neutral.
 * - Lanes ordered by name (localeCompare), then neutral bucket last.
 * - Within each lane: scenes sorted by coalesce(storyDay, order) ascending,
 *   tiebroken by title.
 * - Unresolved lanes have key `unresolved:<text>` and kind `"unresolved"`.
 * @param resolve Optional link resolver. When provided and a plotline link
 *   does not resolve, that lane is emitted with `kind:"unresolved"`. Resolved
 *   plotline lanes keep `kind:"plotline"`. Without a resolver all plotline lanes
 *   use `kind:"plotline"` (backwards-compatible behaviour).
 */
export function swimlaneModel(rows: SceneRow[], key: SwimlaneKey, resolve?: LinkResolver): Group[] {
	type LaneEntry = { label: string; kind: GroupKind; scenes: SceneRow[] };
	const lanes = new Map<string, LaneEntry>(); // lane key → entry
	const neutral: SceneRow[] = [];

	function ensureLane(laneKey: string, label: string, kind: GroupKind): SceneRow[] {
		if (!lanes.has(laneKey)) {
			lanes.set(laneKey, { label, kind, scenes: [] });
		}
		return lanes.get(laneKey)!.scenes;
	}

	function sortKey(r: SceneRow): number {
		return r.storyDay ?? r.order ?? INF;
	}

	function sortScenes(scenes: SceneRow[]): SceneRow[] {
		return [...scenes].sort((a, b) => {
			const ak = sortKey(a);
			const bk = sortKey(b);
			if (ak !== bk) return ak - bk;
			return a.title.localeCompare(b.title);
		});
	}

	if (key === "pov") {
		for (const r of rows) {
			if (r.pov === null) {
				neutral.push(r);
			} else if (r.pov.path === "") {
				// Unresolved pov link
				const lk = `unresolved:${r.pov.name}`;
				ensureLane(lk, r.pov.name, "unresolved").push(r);
			} else {
				const lk = `pov:${r.pov.name}`;
				ensureLane(lk, r.pov.name, "pov").push(r);
			}
		}
	} else if (key === "location") {
		for (const r of rows) {
			if (r.location === null) {
				neutral.push(r);
			} else if (r.location.path === "") {
				const lk = `unresolved:${r.location.name}`;
				ensureLane(lk, r.location.name, "unresolved").push(r);
			} else {
				const lk = `location:${r.location.name}`;
				ensureLane(lk, r.location.name, "location").push(r);
			}
		}
	} else {
		// plotline — fan-out
		for (const r of rows) {
			if (r.plotlines.length === 0) {
				neutral.push(r);
			} else {
				for (const raw of r.plotlines) {
					const text = stripLink(raw);
					if (resolve) {
						const dest = resolve(text);
						if (dest) {
							const lk = `plotline:${dest.basename}`;
							ensureLane(lk, dest.basename, "plotline").push(r);
						} else {
							const lk = `unresolved:${text}`;
							ensureLane(lk, text, "unresolved").push(r);
						}
					} else {
						// No resolver: treat stripped text as the lane name (backwards-compatible).
						const lk = `plotline:${text}`;
						ensureLane(lk, text, "plotline").push(r);
					}
				}
			}
		}
	}

	// Build sorted group list: named lanes sorted by label, then neutral last.
	const namedLanes = [...lanes.entries()]
		.sort(([, a], [, b]) => a.label.localeCompare(b.label))
		.map(([laneKey, entry]) => ({
			key: laneKey,
			label: entry.label,
			kind: entry.kind,
			scenes: sortScenes(entry.scenes),
		}));

	const result: Group[] = [...namedLanes];

	if (neutral.length > 0) {
		result.push({
			key: "neutral",
			label: NEUTRAL_LANE[key],
			kind: "unassigned",
			scenes: sortScenes(neutral),
		});
	}

	return result;
}

