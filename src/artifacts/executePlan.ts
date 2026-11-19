/**
 * executePlan.ts — run a setup plan (planSetup) through the managed writer, recording each write.
 *
 * Writes `create`, `update` and `missing` items in plan order; every other action is skipped with
 * its reason. Each write is followed by its record save; when that save fails the write is undone
 * (a new file trashed, a replaced file restored), so a failure never claims a write (PRD Rule 5).
 * Every placeholder resolves with the `folders` the plan was computed with, and the record keeps
 * them as `params`.
 *
 * Planning and writing are apart in time, so each write is re-checked first: a create (or
 * missing) target must still be free, an update target must still hold the bytes Story Forge
 * wrote. A file that slips in after that check is detected from the write's captured previous
 * content and restored. A file Story Forge did not write is never changed (PRD Rule 2).
 *
 * Never throws: every failure lands in the result.
 *
 * @ref SDD/Primary Flow (step 5)
 * @ref SDD/Error Handling
 * @ref PRD/F2.8, PRD/F4 Rule 5, PRD/F5.8
 */

import type { App } from "obsidian";
import { computeChecksum } from "../consent/checksum";
import {
	checkOccupied,
	editedRefusal,
	ensureFolder,
	occupiedRefusal,
	readExisting,
	undo,
	write,
	type Written,
} from "../vault/managedFileWriter";
import type { ArtifactStore } from "./ArtifactStore";
import type { ArtifactFolders, ArtifactSet, PlanItem } from "./artifactTypes";
import { FOLDER_OF } from "./planSetup";
import { normalizeFolder, resolvePlaceholders } from "./resolvePlaceholders";

export interface ExecutePlanDeps {
	app: App;
	/** Loaded store: an update's record is read from it. */
	store: ArtifactStore;
	/** Manifest version, kept in each record (diagnostics only). */
	pluginVersion: string;
}

export interface PlanOutcome {
	path: string;
	reason: string;
}

export interface ExecutePlanResult {
	written: string[];
	skipped: PlanOutcome[];
	failed: PlanOutcome[];
}

const INSTALLED = "Not installed";
const UPDATED = "Not updated";

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

const writes = (item: PlanItem): boolean =>
	item.action === "create" || item.action === "update" || item.action === "missing";

/** Why a non-writing item is skipped. */
function skipReason(item: PlanItem): string {
	switch (item.action) {
		case "up-to-date":
			return item.note === undefined ? "up to date" : `up to date; ${item.note}`;
		case "skip-exists":
			return occupiedRefusal(item.path, INSTALLED);
		case "skip-edited":
			return editedRefusal(item.path, UPDATED);
		default:
			return item.note ?? item.action;
	}
}

/** Thrown inside one item to land it in `skipped` rather than `failed`. */
class Skip extends Error {}

/**
 * Ensure each set's configured folder once, for sets that will create a file. Returns the
 * failure reason per set whose folder could not be created.
 */
async function ensureSetFolders(
	app: App,
	plan: readonly PlanItem[],
	folders: ArtifactFolders,
): Promise<Map<ArtifactSet, string>> {
	const failures = new Map<ArtifactSet, string>();
	const done = new Set<ArtifactSet>();
	for (const item of plan) {
		const set = item.entry.set;
		if (done.has(set) || (item.action !== "create" && item.action !== "missing")) continue;
		done.add(set);
		const folder = normalizeFolder(folders[FOLDER_OF[set]]);
		try {
			await ensureFolder(app, folder);
		} catch (err) {
			failures.set(set, `${INSTALLED}: could not create folder ${folder}: ${messageOf(err)}`);
		}
	}
	return failures;
}

/** Write one item and save its record; throws a Skip or an Error with the reported reason. */
async function writeItem(item: PlanItem, folders: ArtifactFolders, deps: ExecutePlanDeps): Promise<void> {
	const { app, store } = deps;
	const { entry, path } = item;
	const prefix = item.action === "update" ? UPDATED : INSTALLED;

	if ((await computeChecksum(entry.source)) !== entry.checksum) throw new Skip("checksum mismatch");
	let content: string;
	try {
		content = resolvePlaceholders(entry.source, folders);
	} catch (err) {
		throw new Error(`${prefix}: ${messageOf(err)}`);
	}

	let expectedPrevious: string | null = null;
	if (item.action === "update") {
		const record = store.get(entry.id);
		if (record === undefined) throw new Error(`${prefix}: no install record for ${path}`);
		const existing = await readExisting(app, path, prefix);
		if ("refusal" in existing) throw new Skip(existing.refusal);
		if ("absent" in existing) throw new Error(`${prefix}: ${path} no longer exists`);
		if ((await computeChecksum(existing.content)) !== record.instanceChecksum) {
			throw new Skip(editedRefusal(path, prefix));
		}
		expectedPrevious = existing.content;
	} else {
		const refusal = await checkOccupied(app, path, content, prefix, { adoptIdentical: false });
		if (refusal !== null) throw new Skip(refusal);
	}

	let written: Written;
	try {
		written = await write(app, path, content);
	} catch (err) {
		throw new Error(`${prefix}: could not write ${path}: ${messageOf(err)}`);
	}
	if (written.previous !== expectedPrevious) {
		await undo(app, written).catch(() => undefined);
		const what = item.action === "update" ? "changed while updating" : "appeared while installing";
		throw new Error(`${prefix}: ${path} ${what}; it was left as it was.`);
	}

	try {
		await store.setRecord(entry.id, {
			path: written.path,
			sourceChecksum: entry.checksum,
			instanceChecksum: await computeChecksum(content),
			params: { ...folders },
			pluginVersion: deps.pluginVersion,
		});
	} catch (err) {
		let reason = `${prefix}: could not record ${path}: ${messageOf(err)}`;
		try {
			await undo(app, written);
		} catch (undoErr) {
			reason += `; undoing the write failed: ${messageOf(undoErr)}`;
		}
		throw new Error(reason);
	}
}

/**
 * Execute `plan` (from planSetup, computed with `folders`). The result lists the paths written,
 * and each skipped or failed item with its reason, in plan order.
 */
export async function executePlan(
	plan: readonly PlanItem[],
	folders: ArtifactFolders,
	deps: ExecutePlanDeps,
): Promise<ExecutePlanResult> {
	const result: ExecutePlanResult = { written: [], skipped: [], failed: [] };
	const folderFailures = await ensureSetFolders(deps.app, plan, folders);

	for (const item of plan) {
		if (!writes(item)) {
			result.skipped.push({ path: item.path, reason: skipReason(item) });
			continue;
		}
		const folderFailure = folderFailures.get(item.entry.set);
		if (folderFailure !== undefined) {
			result.failed.push({ path: item.path, reason: folderFailure });
			continue;
		}
		try {
			await writeItem(item, folders, deps);
			result.written.push(item.path);
		} catch (err) {
			const outcome = { path: item.path, reason: messageOf(err) };
			(err instanceof Skip ? result.skipped : result.failed).push(outcome);
		}
	}
	return result;
}
