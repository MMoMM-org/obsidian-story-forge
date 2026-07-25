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

export type GroupKind = "act" | "plotline" | "status" | "unassigned" | "no-act" | "unresolved";

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
 */
export function insertOrder(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return 10;
	if (before === null) return (after as number) - 10;
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
	const INF_ORDER = Number.POSITIVE_INFINITY;

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
			const ao = a.order ?? INF_ORDER;
			const bo = b.order ?? INF_ORDER;
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
// snapStoryDay (M6 — T1.3)
// ---------------------------------------------------------------------------

/**
 * Map a fractional drop ratio (0..1) along the timeline rail to a whole story
 * day. Returns `clamp(round(interpolated), 1, maxDay + 1)` so:
 * - Drop before all scenes → clamps to ≥ 1.
 * - Drop after all scenes → clamps to maxDay + 1.
 * - Scenes with null storyDay are excluded from the day axis but the function
 *   always returns an integer (never NaN, never a fraction). (ADR-18)
 */
export function snapStoryDay(rows: SceneRow[], dropRatio: number): number {
	const days = rows
		.map((r) => r.storyDay)
		.filter((d): d is number => d !== null)
		.sort((a, b) => a - b);

	if (days.length === 0) {
		// No storyDay data — clamp to minimum of 1
		return 1;
	}

	const minDay = days[0]!;
	const maxDay = days[days.length - 1]!;

	if (maxDay === minDay) {
		// Single distinct day: before → minDay, after → minDay+1
		const raw = minDay + dropRatio; // ratio 0 → minDay, ratio 1 → minDay+1
		return Math.max(minDay, Math.min(maxDay + 1, Math.round(raw)));
	}

	const raw = minDay + dropRatio * (maxDay - minDay);
	const snapped = Math.round(raw);
	return Math.max(1, Math.min(maxDay + 1, snapped));
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
 */
export function swimlaneModel(rows: SceneRow[], key: SwimlaneKey): Group[] {
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
		return r.storyDay ?? r.order ?? Number.POSITIVE_INFINITY;
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
				ensureLane(lk, r.pov.name, "plotline").push(r);
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
				ensureLane(lk, r.location.name, "plotline").push(r);
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
					// We treat a non-empty text as a valid name; unresolved if we can't
					// tell, but swimlaneModel does not take a resolver.
					// Per spec: fan-out, unresolved lane flagged by presence in plotlines
					// (swimlaneModel receives resolved Link[] from sceneMapper so text
					// is already a resolved name when it's in plotlines).
					// However sceneMapper stores raw strings. We strip the brackets.
					const lk = `plotline:${text}`;
					ensureLane(lk, text, "plotline").push(r);
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

// ---------------------------------------------------------------------------
// LocationTree (M6 — T1.5)
// ---------------------------------------------------------------------------

/** Maximum nesting depth before a cycle/over-depth node is flagged. (ADR-19) */
export const MAX_DEPTH = 32;

/**
 * Minimal row shape for a location note. `world` is the raw parent-link text
 * (stripped of `[[ ]]`), or `""` when the location has no parent.
 */
export interface LocationRow {
	file: TFile;
	name: string;
	/** Raw `world` frontmatter value (may be `[[wrapped]]` or plain), `""` if none. */
	world: string;
}

/** A node in the resolved location hierarchy. */
export interface LocationNode {
	file: TFile;
	name: string;
	children: LocationNode[];
	/** True when the node's parent is unresolved, or the node is a cycle/depth violation. */
	flagged: boolean;
}

/**
 * Build a location hierarchy tree by resolving each location's `world` field
 * through `resolve`. Rules (ADR-19):
 * - Roots: locations whose `world` is `""` or cannot be resolved.
 * - Unresolved `world` → location placed at root with `flagged: true`.
 * - Cycle or depth > MAX_DEPTH → offending node `flagged`, recursion stops.
 * - Pure-cycle members (no external anchor) are surfaced as flagged roots.
 * - Siblings ordered by name (deterministic).
 * - Never infinite-loops (visited Set<path> + depth counter guard).
 */
export function locationTreeModel(
	locations: LocationRow[],
	resolve: LinkResolver,
): LocationNode[] {
	// Identify roots: no world, or unresolved world.
	const roots: Array<{ row: LocationRow; flagged: boolean }> = [];
	const childRows = new Map<string, Array<{ row: LocationRow; flagged: boolean }>>();
	// parentBasename → children

	for (const loc of locations) {
		if (loc.world === "") {
			roots.push({ row: loc, flagged: false });
		} else {
			const text = stripLink(loc.world);
			const dest = resolve(text);
			if (!dest) {
				// Unresolved parent → place at root, flagged
				roots.push({ row: loc, flagged: true });
			} else {
				const parentName = dest.basename;
				const bucket = childRows.get(parentName) ?? [];
				bucket.push({ row: loc, flagged: false });
				childRows.set(parentName, bucket);
			}
		}
	}

	// Track which paths are placed during DFS so we can detect pure-cycle orphans.
	const placed = new Set<string>();

	// DFS to build the tree; visited set prevents cycles.
	function buildNode(
		entry: { row: LocationRow; flagged: boolean },
		visited: Set<string>,
		depth: number,
	): LocationNode {
		const { row, flagged } = entry;
		const path = row.file.path;
		placed.add(path);

		if (visited.has(path) || depth > MAX_DEPTH) {
			// Cycle or depth limit — flag, no children.
			return { file: row.file, name: row.name, children: [], flagged: true };
		}

		const childVisited = new Set(visited);
		childVisited.add(path);

		const children = (childRows.get(row.name) ?? [])
			.sort((a, b) => a.row.name.localeCompare(b.row.name))
			.map((child) => buildNode(child, childVisited, depth + 1));

		return { file: row.file, name: row.name, children, flagged };
	}

	const result = roots
		.sort((a, b) => a.row.name.localeCompare(b.row.name))
		.map((entry) => buildNode(entry, new Set<string>(), 0));

	// Second pass: any location not yet placed is part of a pure cycle (every
	// member points to another member — no external root). Surface them as
	// flagged roots in deterministic name order.
	const orphans = locations
		.filter((loc) => !placed.has(loc.file.path))
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const loc of orphans) {
		result.push({ file: loc.file, name: loc.name, children: [], flagged: true });
	}

	return result;
}
