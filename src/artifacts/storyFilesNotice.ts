/**
 * storyFilesNotice.ts — the pure composition of the "Set up story files" result notice
 * (mockups.html S5a–S5d, D10, O6). No DOM: StoryFilesModal draws what this returns.
 *
 * - First line: what was written ("Set up N…", "Updated N…", "Set up N and updated M…",
 *   "No story files written.").
 * - Then Failed, then Skipped, each with its file count and one line per distinct reason;
 *   identical reasons collapse into one line plus "The same reason for N more files in <folder>."
 * - At most MAX_NOTICE_LINES reason lines in total, then "and N more. …" (N counts files).
 * - Nothing skipped or failed: a status that hides on its own; otherwise a sticky alert.
 *
 * @ref PRD/F2.7
 */

import { parentFolderOf } from "../vault/managedFileWriter";
import type { ExecutePlanResult, PlanOutcome } from "./executePlan";

export const MAX_NOTICE_LINES = 5;

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
 * Compose the notice for `result`. `updatePaths` are the paths that were planned as updates;
 * `planSkips` are the plan's own refusals (listed before the re-check skips of `result`).
 */
export function composeNotice(
	result: ExecutePlanResult,
	updatePaths: ReadonlySet<string>,
	planSkips: readonly PlanOutcome[],
): ComposedNotice {
	const updated = result.written.filter((p) => updatePaths.has(p)).length;
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
		sections,
		...(hidden > 0 ? { tail: `and ${hidden} more. Open Set up story files again to see each file.` } : {}),
		debug: [...result.failed, ...skipped].map((o) => `[StoryForge] ${o.reason}`),
	};
}
