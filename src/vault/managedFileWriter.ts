/**
 * managedFileWriter — the one writer for every user-requested vault write (spec 010, ADR-41).
 *
 * Reads, folder creation, writes and their undo all go through the Vault API
 * (`getAbstractFileByPath`, `read`, `create`, `process`, `createFolder`) and
 * `fileManager.trashFile`, never `vault.adapter` (CON-3): the vault then fires its events at
 * once, and trashing follows the user's "deleted files" preference. Mobile-safe: no
 * desktop-only API.
 *
 * The refusal sentences are the catalog's, word for word (`describeRefusal` passes anything
 * starting with "Not installed"/"Not updated" through unchanged). Adopting an identical file is
 * the catalog's rule only (`adoptIdentical`); artifacts never adopt (PRD Rule 2).
 *
 * @ref SDD/ADR-41
 * @ref SDD/Internal API Changes
 * @ref PRD/F6.4 (every vault write through the Vault API)
 */

import { normalizePath, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";

/** A file `write` wrote, with its content before (`null`: it did not exist). */
export interface Written {
	path: string;
	previous: string | null;
}

/** What is at a path: a file's content, nothing, or a refusal (it cannot be read). */
export type Existing = { content: string } | { absent: true } | { refusal: string };

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** The file at `path` (normalized); `null` when there is none. Throws when a folder is there. */
function fileAt(app: App, path: string): TFile | null {
	const found = app.vault.getAbstractFileByPath(normalizePath(path));
	if (found instanceof TFile) return found;
	if (found instanceof TFolder) throw new Error(`${path} is a folder`);
	return null;
}

/** The content at `path`, `{ absent }` when nothing is there, or a refusal starting with `prefix`. */
export async function readExisting(app: App, path: string, prefix: string): Promise<Existing> {
	try {
		const found = app.vault.getAbstractFileByPath(normalizePath(path));
		if (found instanceof TFolder) throw new Error("it is a folder");
		if (!(found instanceof TFile)) return { absent: true };
		return { content: await app.vault.read(found) };
	} catch (err) {
		return { refusal: `${prefix}: could not read ${path}: ${messageOf(err)}` };
	}
}

/**
 * Make sure `folder` exists, creating every missing level outermost first. `createFolder` fails
 * on an existing folder, so each level is checked first; a level that appears in between (a
 * concurrent create) is accepted. Throws when a file occupies a level.
 */
export async function ensureFolder(app: App, folder: string): Promise<void> {
	const segments = normalizePath(folder).split("/").filter((s) => s !== "");
	let path = "";
	for (const segment of segments) {
		path = path === "" ? segment : `${path}/${segment}`;
		const found = app.vault.getAbstractFileByPath(path);
		if (found instanceof TFolder) continue;
		if (found instanceof TFile) throw new Error(`${path} is a file`);
		try {
			await app.vault.createFolder(path);
		} catch (err) {
			if (!(app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw err;
		}
	}
}

/**
 * Write `content` to `path`: replace an existing file with `process` (its previous content is
 * captured inside the same atomic step) or `create` a new one after its parent folders. Throws on
 * any vault error, and when a folder is at `path`.
 */
export async function write(app: App, path: string, content: string): Promise<Written> {
	const target = normalizePath(path);
	const file = fileAt(app, target);
	if (file !== null) {
		let previous = "";
		await app.vault.process(file, (data: string) => {
			previous = data;
			return content;
		});
		return { path: target, previous };
	}
	const slash = target.lastIndexOf("/");
	if (slash > 0) await ensureFolder(app, target.slice(0, slash));
	await app.vault.create(target, content);
	return { path: target, previous: null };
}

/**
 * Undo `written`: trash a file the write created, restore (or recreate) the previous content of
 * one it replaced. Throws on a vault error; callers decide whether that is best-effort.
 */
export async function undo(app: App, written: Written): Promise<void> {
	const file = fileAt(app, written.path);
	if (written.previous === null) {
		if (file !== null) await app.fileManager.trashFile(file);
		return;
	}
	const previous = written.previous;
	if (file !== null) await app.vault.process(file, () => previous);
	else await app.vault.create(written.path, previous);
}

/** The refusal for a file the user edited after it was installed. */
export function editedRefusal(path: string, prefix: string): string {
	return `${prefix}: ${path} was edited after it was installed, and updating would overwrite those edits.`;
}

/** The refusal for a path a file we did not write already occupies. */
export function occupiedRefusal(path: string, prefix: string): string {
	return `${prefix}: ${path} already exists. Move, rename or remove it, then install again.`;
}

/**
 * Refuse a fresh write onto an occupied `path`; `null` lets it proceed (nothing there). With
 * `adoptIdentical` a file holding exactly `content` is adopted (the catalog's lost-record rule);
 * without it every existing file refuses. An unreadable file refuses with its read error.
 */
export async function checkOccupied(
	app: App,
	path: string,
	content: string,
	prefix: string,
	options: { adoptIdentical: boolean },
): Promise<string | null> {
	const read = await readExisting(app, path, prefix);
	if ("refusal" in read) return read.refusal;
	if ("absent" in read) return null;
	if (options.adoptIdentical && read.content === content) return null;
	return occupiedRefusal(path, prefix);
}
