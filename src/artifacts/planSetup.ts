/**
 * planSetup.ts — pure per-file plan for setting up and updating shipped vault
 * artifacts. Reads through an injected `readFile`; writes nothing.
 *
 * A file Story Forge did not write is never claimed (no record → skip-exists,
 * even with identical bytes). A record's path wins over the current folder
 * setting. An index entry whose checksum does not match its source is refused
 * (fail closed, as the catalog).
 *
 * @ref SDD/Application Data Models — planSetup decision table
 * @ref PRD/F4.1, F4.3, F4.4, F4.5, F4.6, F3.4
 */

import { computeChecksum } from "../consent/checksum";
import type {
	ArtifactEntry,
	ArtifactFileRead,
	ArtifactFolders,
	ArtifactIndex,
	ArtifactPlaceholder,
	ArtifactRecords,
	ArtifactSet,
	PlanItem,
} from "./artifactTypes";
import { normalizeFolder } from "./resolvePlaceholders";

const FOLDER_OF: Record<ArtifactSet, ArtifactPlaceholder> = {
	fileclasses: "fileClassesFolder",
	templates: "templatesFolder",
	schema: "schemaFolder",
};

/** Normalised vault path for `entry` under the current folder settings. */
export function targetPathOf(entry: ArtifactEntry, folders: ArtifactFolders): string {
	return normalizeFolder(`${normalizeFolder(folders[FOLDER_OF[entry.set]])}/${entry.relPath}`);
}

async function planEntry(
	entry: ArtifactEntry,
	records: ArtifactRecords,
	readFile: (path: string) => Promise<ArtifactFileRead>,
	folders: ArtifactFolders,
): Promise<PlanItem> {
	const target = targetPathOf(entry, folders);
	if ((await computeChecksum(entry.source)) !== entry.checksum) {
		return { entry, path: target, action: "refused", note: "checksum mismatch" };
	}

	const record = records[entry.id];
	const path = record ? normalizeFolder(record.path) : target;
	const settingNote =
		path !== target
			? `setting now points to ${normalizeFolder(folders[FOLDER_OF[entry.set]])}`
			: undefined;
	const item = (action: PlanItem["action"], extra?: string): PlanItem => {
		const note = [settingNote, extra].filter((n) => n !== undefined).join("; ");
		return note === "" ? { entry, path, action } : { entry, path, action, note };
	};

	const file = await readFile(path);
	if (file.kind === "unreadable") return item("unreadable", file.reason);

	if (!record) return item(file.kind === "absent" ? "create" : "skip-exists");
	if (file.kind === "absent") return item("missing");
	if (entry.checksum === record.sourceChecksum) return item("up-to-date");
	if ((await computeChecksum(file.text)) === record.instanceChecksum) return item("update");
	return item("skip-edited");
}

/** One PlanItem per index entry in a selected set, in index order. */
export async function planSetup(
	index: ArtifactIndex,
	records: ArtifactRecords,
	readFile: (path: string) => Promise<ArtifactFileRead>,
	folders: ArtifactFolders,
	selectedSets: readonly ArtifactSet[],
): Promise<PlanItem[]> {
	const plan: PlanItem[] = [];
	for (const entry of index.entries) {
		if (!selectedSets.includes(entry.set)) continue;
		plan.push(await planEntry(entry, records, readFile, folders));
	}
	return plan;
}
