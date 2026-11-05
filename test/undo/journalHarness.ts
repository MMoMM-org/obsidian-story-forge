/**
 * journalHarness — a mock vault, the real writer and a journal wired together (spec 009 T2.4).
 *
 * Writes go through the real `commit`, so the journal records what the writer
 * captured, and undo/redo go through the real `restore` from
 * `installWriteRecorder`. Every note carries an unrelated key and a body, so
 * `expectUntouched` can check that an apply touched nothing outside the step.
 */
import { expect, vi } from "vitest";
import { App, TFolder, createMockTFile, type TFile } from "../__mocks__/obsidian";
import { commit, installWriteRecorder, type RestoreFn } from "inspector/frontmatterWriter";
import { createUndoJournal, type OwnedUndoJournal } from "undo/undoJournal";
import type { FileChanges, JournalSnapshot, JournalStore, Slot, Step } from "undo/journalTypes";

export const MARA = "20 Characters/Mara Stoneway.md";
export const SCENE_4 = "30 Scenes/Scene 4.md";
export const SCENE_5 = "30 Scenes/Scene 5.md";

/** The key every fixture note carries and no step ever touches. */
export const UNRELATED = { aliases: ["keep"] } as const;

export const present = (value: unknown): Slot => ({ present: true, value });
export const ABSENT: Slot = { present: false };

export const EMPTY: JournalSnapshot = { undo: [], redo: [] };

export interface FakeStore extends JournalStore {
	/** Every snapshot handed to `save`, oldest first. */
	readonly saves: JournalSnapshot[];
}

/** An in-memory `JournalStore`: `load` returns `initial`, `save` keeps a copy. */
export function fakeStore(initial: JournalSnapshot = EMPTY): FakeStore {
	const saves: JournalSnapshot[] = [];
	return {
		saves,
		load: () => Promise.resolve(initial),
		save: (snapshot) => void saves.push(structuredClone(snapshot)),
		flushNow: () => Promise.resolve(),
		remove: () => Promise.resolve(),
	};
}

/** A step as the journal would hold it, for seeding a store. */
export function stepOf(id: string, files: readonly FileChanges[]): Step {
	return { id, at: 1, files, persist: true };
}

export interface Harness {
	readonly app: App;
	readonly journal: OwnedUndoJournal;
	readonly store: FakeStore;
	readonly notices: string[];
	/** Write one field through the real writer (a number field for numbers, else text). */
	write(path: string, key: string, value: unknown): Promise<void>;
	/** The note's current frontmatter (a copy). */
	fm(path: string): Record<string, unknown>;
	/** A change made outside Story Forge (a script, a hand edit): merged in, `undefined` deletes. */
	outsideEdit(path: string, patch: Record<string, unknown>): void;
	/** The note is gone from the vault. */
	removeNote(path: string): void;
	/** The note is gone and a folder now sits at its path. */
	replaceWithFolder(path: string): void;
	/** Stacks as last saved, or EMPTY when nothing was saved yet. */
	lastSave(): JournalSnapshot;
}

interface SetupOptions {
	readonly store?: FakeStore;
	/** Wrap the real restore, e.g. to fail one file or to observe concurrency. */
	readonly wrapRestore?: (real: RestoreFn) => RestoreFn;
}

const live: { app: App; journal: OwnedUndoJournal; uninstall(): void; bodies: Map<string, string>; initialBodies: Map<string, string> }[] = [];

function makeFile(path: string): TFile {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return createMockTFile({ path, name, basename: name.replace(/\.md$/, "") });
}

/** A vault index faithful to obsidian.d.ts: getFileByPath answers only files, never a folder. */
function wireVault(app: App, files: Map<string, TFile>, folders: Map<string, TFolder>, bodies: Map<string, string>): void {
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => files.get(p) ?? folders.get(p) ?? null);
	vi.mocked(app.vault.read).mockImplementation(async (f: TFile) => bodies.get(f.path) ?? "");
	vi.mocked(app.vault.modify).mockImplementation(async (f: TFile, data: string) => void bodies.set(f.path, data));
}

export function setup(notes: Record<string, Record<string, unknown>>, opts: SetupOptions = {}): Harness {
	const app = new App();
	const files = new Map<string, TFile>();
	const folders = new Map<string, TFolder>();
	const bodies = new Map<string, string>();
	for (const [path, fm] of Object.entries(notes)) {
		files.set(path, makeFile(path));
		bodies.set(path, `# ${path}\n\nBody text that no undo may touch.\n`);
		app.fileManager._setFrontmatter(path, { ...UNRELATED, ...fm });
	}
	wireVault(app, files, folders, bodies);
	const store = opts.store ?? fakeStore();
	const notices: string[] = [];
	let restore: RestoreFn | null = null;
	const journal = createUndoJournal({ app, store, notify: (m) => void notices.push(m), now: () => 1_000, restore: () => restore! });
	const handle = installWriteRecorder(app, journal);
	restore = opts.wrapRestore ? opts.wrapRestore(handle.restore) : handle.restore;
	live.push({ app, journal, uninstall: () => handle.uninstall(), bodies, initialBodies: new Map(bodies) });
	return {
		app, journal, store, notices,
		write: async (path, key, value) => {
			const result = await commit(app, files.get(path)!, key, value, typeof value === "number" ? { name: key, type: "number" } : { name: key, type: "text" });
			expect(result.ok).toBe(true);
		},
		fm: (path) => structuredClone(app.fileManager._getFrontmatter(path)),
		outsideEdit: (path, patch) => {
			const next: Record<string, unknown> = { ...app.fileManager._getFrontmatter(path), ...patch };
			for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
			app.fileManager._setFrontmatter(path, next);
		},
		removeNote: (path) => void files.delete(path),
		replaceWithFolder: (path) => {
			files.delete(path);
			const folder = new TFolder();
			folder.path = path;
			folders.set(path, folder);
		},
		lastSave: () => store.saves[store.saves.length - 1] ?? EMPTY,
	};
}

/**
 * The reliability guard (SDD/Quality Requirements): around every apply test, no
 * note body changed, the unrelated key is intact, and nothing created, modified,
 * renamed or deleted a note. Then uninstall and dispose.
 */
export function teardownAndCheckUntouched(): void {
	for (const h of live.splice(0)) {
		h.uninstall();
		h.journal.dispose();
		expect(h.bodies).toEqual(h.initialBodies);
		for (const path of h.initialBodies.keys()) {
			expect(h.app.fileManager._getFrontmatter(path).aliases).toEqual(UNRELATED.aliases);
		}
		const v = h.app.vault;
		for (const fn of [v.create, v.modify, v.process, v.delete, v.trash, v.adapter.rename, v.adapter.remove]) {
			expect(fn).not.toHaveBeenCalled();
		}
	}
	vi.restoreAllMocks();
}
