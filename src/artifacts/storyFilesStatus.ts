/**
 * storyFilesStatus — the read-only status of the shipped story files (spec 010, S1b / S6).
 *
 * `summarizeStoryFiles` is pure: it turns a plan and the install records into the S1b status
 * line (`line`) and its shortened form for the capability screen (`short`). `readStoryFilesStatus`
 * computes the plan read-only (`planSetup` over `readExisting`) and summarizes it. Nothing here
 * writes. Reused by the capability screen (T3.4), the Scope tab line and the Library hint (T3.3).
 *
 * Counting (S1b): updates = action `update`; missing = `missing`; "set up" = files with a record;
 * `skip-edited` only shows as an aside; `skip-exists`, `unreadable` and `refused` count for nothing.
 *
 * @ref SDD/ADR-42
 * @ref PRD/F2.9
 */

import type { App } from "obsidian";
import { readExisting } from "../vault/managedFileWriter";
import { planSetup } from "./planSetup";
import type {
	ArtifactFileRead,
	ArtifactFolders,
	ArtifactIndex,
	ArtifactRecords,
	ArtifactSet,
	PlanItem,
} from "./artifactTypes";

export interface StoryFilesStatus {
	/** none: no file set up; up-to-date; partial: some files are not set up; actions: updates or missing. */
	kind: "none" | "up-to-date" | "partial" | "actions";
	/** The capability screen's status text. */
	short: string;
	/** The full S1b status line, asides included. */
	line: string;
	tone: "on" | "off" | "neutral";
	updates: number;
	missing: number;
	/** Files with an install record. */
	setUp: number;
	total: number;
}

const SET_NAMES: Record<ArtifactSet, string> = {
	fileclasses: "FileClasses",
	templates: "Templates",
	schema: "Schema reference",
};

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

function joinNames(names: string[]): string {
	return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
}

export function summarizeStoryFiles(plan: readonly PlanItem[], records: ArtifactRecords): StoryFilesStatus {
	const total = plan.length;
	const hasRecord = (i: PlanItem): boolean => records[i.entry.id] !== undefined;
	const setUp = plan.filter(hasRecord).length;
	const updates = plan.filter((i) => i.action === "update").length;
	const missing = plan.filter((i) => i.action === "missing").length;
	const edited = plan.filter((i) => i.action === "skip-edited").length;
	const upToDate = plan.filter((i) => i.action === "up-to-date").length;
	const editedAside = edited > 0
		? ` (${edited === 1 ? "1 edited file left as it is" : `${edited} edited files left as they are`})`
		: "";
	const counts = { updates, missing, setUp, total };

	if (setUp === 0) {
		return {
			kind: "none",
			short: "Not set up",
			line: "Not set up. Writes FileClasses, templates and a schema reference into the folders above, after you confirm.",
			tone: "off",
			...counts,
		};
	}
	if (updates > 0 || missing > 0) {
		const parts = [
			...(updates > 0 ? [`${plural(updates, "update", "updates")} available`] : []),
			...(missing > 0 ? [`${missing} missing`] : []),
		];
		const short = parts.join(" · ");
		const aside = missing > 0 && updates === 0
			? " A set-up file was moved or deleted; it is not recreated unless you ask."
			: editedAside;
		return { kind: "actions", short, line: `${short}.${aside}`, tone: "neutral", ...counts };
	}
	if (setUp === total) {
		return {
			kind: "up-to-date",
			short: `${setUp} set up`,
			line: `${setUp} story files set up and up to date.${editedAside}`,
			tone: "on",
			...counts,
		};
	}
	const sets = [...new Set(plan.map((i) => i.entry.set))];
	const isSetUp = (s: ArtifactSet): boolean => plan.some((i) => i.entry.set === s && hasRecord(i));
	const done = sets.filter(isSetUp).map((s) => SET_NAMES[s]);
	const todo = sets.filter((s) => !isSetUp(s)).map((s) => SET_NAMES[s]);
	const short = todo.length > 0
		? `${joinNames(done)} set up · ${joinNames(todo)} not set up`
		: `${setUp} of ${total} set up`;
	return {
		kind: "partial",
		short,
		line: `${short}. ${upToDate} of ${total} story files up to date.${editedAside}`,
		tone: "neutral",
		...counts,
	};
}

/** Plan read-only against the vault, then summarize. Never writes, never throws on a bad path. */
export async function readStoryFilesStatus(
	app: App,
	index: ArtifactIndex,
	records: ArtifactRecords,
	folders: ArtifactFolders,
): Promise<StoryFilesStatus> {
	const readFile = async (path: string): Promise<ArtifactFileRead> => {
		const found = await readExisting(app, path, "Story files");
		if ("refusal" in found) return { kind: "unreadable", reason: found.refusal };
		if ("absent" in found) return { kind: "absent" };
		return { kind: "content", text: found.content };
	};
	const plan = await planSetup(index, records, readFile, folders, ["fileclasses", "templates", "schema"]);
	return summarizeStoryFiles(plan, records);
}
