/**
 * storyFilesNotice.ts — the pure composition of the "Set up story files" result notice
 * (mockups.html S5a–S5d, D10, O6). No DOM: StoryFilesModal draws what this returns.
 *
 * - First line: what was written ("Set up N…", "Updated N…", "Set up N and updated M…",
 *   "No story files written.").
 * - Then one line per set and folder that had files written (R2): "7 templates in Story/Templates",
 *   "2 FileClasses updated in 00 Meta/FileClasses", "7 templates set up in Story/Templates · 1 updated".
 *   They do not count against the line budget.
 * - Then Failed, then Skipped, each with its file count and one line per distinct reason;
 *   identical reasons collapse into one line plus "The same reason for N more files in <folder>."
 * - At most MAX_NOTICE_LINES reason lines in total, then "and N more. …" (N counts files).
 * - Nothing skipped or failed: a status that hides on its own; otherwise a sticky alert.
 *
 * @ref PRD/F2.7
 */

import { parentFolderOf } from "../vault/managedFileWriter";
import type { ArtifactSet } from "./artifactTypes";
import type { ExecutePlanResult, PlanOutcome } from "./executePlan";

export const MAX_NOTICE_LINES = 5;

/** What the plan meant to write at a path: its set, whether it is an update, and its folder. */
export interface PlannedWrite {
	set: ArtifactSet;
	update: boolean;
	/** The folder the file goes to (a record's folder for updates and set-up-again files). */
	folder: string;
}

export interface NoticeLine {
	text: string;
	/** "The same reason for N more files in <folder>." when the reason repeats. */
	more?: string;
}

export interface NoticeSection {
	heading: string;
	lines: NoticeLine[];
}

export interface ComposedNotice {
	/** S5a/b hide on their own (status); S5c/d stay until clicked (alert). */
	role: "status" | "alert";
	sticky: boolean;
	head: string;
	/** One line per set and folder that had files written (R2), in set order. */
	setLines: string[];
	sections: NoticeSection[];
	/** "and N more. …" when lines were cut. */
	tail?: string;
	/** One `[StoryForge] …` line per failed or skipped file. */
	debug: string[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The refusal for an index entry whose bundled source fails its checksum (S3, S5c). */
export function damagedRefusal(subject: string): string {
	return `Not installed: the bundled copy of ${subject} is damaged, so nothing was written. Reinstalling Story Forge restores it.`;
}

function writtenLine(created: number, updated: number): string {
	if (created > 0 && updated > 0) return `Set up ${created} and updated ${plural(updated, "story file", "story files")}.`;
	if (created > 0) return `Set up ${plural(created, "story file", "story files")}.`;
	if (updated > 0) return `Updated ${plural(updated, "story file", "story files")}.`;
	return "No story files written.";
}

/** Set order of the dialog, with each set's noun (singular, plural). */
const SET_NOUNS: readonly [ArtifactSet, string, string][] = [
	["fileclasses", "FileClass", "FileClasses"],
	["templates", "template", "templates"],
	["schema", "schema reference note", "schema reference notes"],
];

/** One line per set and folder of the written paths (R2); a path not planned has no line. */
function setLines(written: readonly string[], planned: ReadonlyMap<string, PlannedWrite>): string[] {
	const lines: string[] = [];
	for (const [set, one, many] of SET_NOUNS) {
		const byFolder = new Map<string, { created: number; updated: number }>();
		for (const path of written) {
			const p = planned.get(path);
			if (p?.set !== set) continue;
			const counts = byFolder.get(p.folder) ?? { created: 0, updated: 0 };
			if (p.update) counts.updated++;
			else counts.created++;
			byFolder.set(p.folder, counts);
		}
		for (const [folder, { created, updated }] of byFolder) {
			if (updated === 0) lines.push(`${plural(created, one, many)} in ${folder}`);
			else if (created === 0) lines.push(`${plural(updated, one, many)} updated in ${folder}`);
			else lines.push(`${plural(created, one, many)} set up in ${folder} · ${updated} updated`);
		}
	}
	return lines;
}

/** Identical reasons collapse into one group (S5d). */
function group(outcomes: readonly PlanOutcome[]): { reason: string; paths: string[] }[] {
	const groups: { reason: string; paths: string[] }[] = [];
	for (const o of outcomes) {
		const found = groups.find((g) => g.reason === o.reason);
		if (found) found.paths.push(o.path);
		else groups.push({ reason: o.reason, paths: [o.path] });
	}
	return groups;
}

/**
 * Compose the notice for `result`. `planned` holds each path the plan meant to write (its set,
 * whether it is an update, its folder); `planSkips` are the plan's own refusals (listed before
 * the re-check skips of `result`).
 */
export function composeNotice(
	result: ExecutePlanResult,
	planned: ReadonlyMap<string, PlannedWrite>,
	planSkips: readonly PlanOutcome[],
): ComposedNotice {
	const updated = result.written.filter((p) => planned.get(p)?.update === true).length;
	const created = result.written.length - updated;
	const skipped = [...planSkips, ...result.skipped];
	const quiet = result.failed.length === 0 && skipped.length === 0;

	const sections: NoticeSection[] = [];
	let budget = MAX_NOTICE_LINES;
	let hidden = 0;
	for (const [heading, outcomes] of [["Failed", result.failed], ["Skipped", skipped]] as const) {
		const groups = group(outcomes);
		const shown = groups.slice(0, budget);
		budget -= shown.length;
		for (const g of groups.slice(shown.length)) hidden += g.paths.length;
		if (shown.length === 0) continue;
		sections.push({
			heading: `${heading} (${outcomes.length}):`,
			lines: shown.map((g) =>
				g.paths.length > 1
					? { text: g.reason, more: `The same reason for ${plural(g.paths.length - 1, "more file", "more files")} in ${parentFolderOf(g.paths[0]!)}.` }
					: { text: g.reason },
			),
		});
	}

	return {
		role: quiet ? "status" : "alert",
		sticky: !quiet,
		head: writtenLine(created, updated),
		setLines: setLines(result.written, planned),
		sections,
		...(hidden > 0 ? { tail: `and ${hidden} more. Open Set up story files again to see each file.` } : {}),
		debug: [...result.failed, ...skipped].map((o) => `[StoryForge] ${o.reason}`),
	};
}
