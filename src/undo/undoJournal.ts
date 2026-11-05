/**
 * undoJournal — the two stacks behind "Undo/Redo last Story Forge change" (spec 009).
 *
 * The writer reports every successful write through `record` (ADR-44); each
 * report is one step on top of the undo stack, and a new step clears redo.
 * `undo`/`redo` run one at a time on a promise chain (ADR-46): undo writes
 * `before` expecting `after`, redo writes `after` expecting `before`, file by
 * file through the late-bound `restore` capability. A conflict is written
 * anyway; the moved step keeps what the write found, so nothing is lost.
 * Failed files stay on top as a reduced step with the same id, and files whose
 * note is gone are dropped. The journal never creates, renames or deletes a note.
 *
 * Built so far (T2.5): record, stacks, apply, outcomes, `load` from the
 * store, and path upkeep (rename, delete, startup prune). Still to come: the persistence setting
 * and `flushNow` (T2.6), groups, probes and flushers (Phase 3), `clear` (T5.5).
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-46, ADR-48, Complex Logic
 */
import { TFolder, type App, type TAbstractFile, type TFile } from "obsidian";
import type { RestoreFn, RestoreOp, WriteRecorder } from "../inspector/frontmatterWriter";
import type {
	ConflictReport, FieldChange, FileChanges, JournalSnapshot, JournalStore, Slot, Step, StepSummary,
	UndoDirection, UndoOutcome,
} from "undo/journalTypes";
import { outcomeNotice, summariseStep } from "undo/stepLabel";
import { slotsEqual, valueSize } from "undo/yamlValue";

/** Steps kept per stack; the oldest is dropped (ADR-48). */
export const MAX_STEPS = 50;
/** A step holding a longer value (JSON length) is kept this session but never persisted (ADR-48). */
export const MAX_VALUE_CHARS = 16_384;

export interface StackPeek {
	readonly undo: StepSummary | null;
	readonly redo: StepSummary | null;
}

export type OutcomeListener = (outcome: UndoOutcome, message: string) => void;

export interface UndoJournal {
	undo(): Promise<UndoOutcome>;
	redo(): Promise<UndoOutcome>;
	peek(): StackPeek;
	/** Called after any stack change. @returns the call that stops it */
	subscribe(listener: () => void): () => void;
	/** Called with each undo/redo outcome and its notice text. @returns the call that stops it */
	onOutcome(listener: OutcomeListener): () => void;
}

/** The plugin's handle: only `main.ts` holds it (ADR-43). */
export interface OwnedUndoJournal extends UndoJournal, WriteRecorder {
	/** Take the stored stacks; steps recorded before this resolves stay on top. */
	load(): Promise<void>;
	/** A vault `rename`: rewrite the path (a folder: every path under it) on both stacks. */
	onRename(file: TAbstractFile, oldPath: string): Promise<void>;
	/** A vault `delete`: drop the file's records (a folder: those under it) and empty steps. */
	onDelete(file: TAbstractFile): Promise<void>;
	/** Drop every record whose path is no longer a note (renamed or deleted while the plugin was off). */
	pruneUnresolvable(): Promise<void>;
	/** Drop every listener. */
	dispose(): void;
}

export interface UndoJournalDeps {
	readonly app: App;
	/** Late-bound: `installWriteRecorder` runs after the journal exists. */
	readonly restore: () => RestoreFn;
	readonly store: JournalStore;
	/** Shows one notice per outcome (`new Notice(message)`). */
	readonly notify: (message: string) => void;
	readonly now?: () => number;
}

interface Stacks {
	readonly undo: Step[];
	readonly redo: Step[];
}

interface ApplyResult {
	readonly moved: FileChanges[];
	readonly failed: FileChanges[];
	readonly vanished: string[];
	readonly conflicts: ConflictReport[];
}

export function createUndoJournal(deps: UndoJournalDeps): OwnedUndoJournal {
	const stacks: Stacks = { undo: [], redo: [] };
	const subscribers = new Set<() => void>();
	const outcomeListeners = new Set<OutcomeListener>();
	const tell = (): void => runEach(subscribers, (l) => l());
	const changed = (): void => {
		deps.store.save({ undo: [...stacks.undo], redo: [...stacks.redo] });
		tell();
	};
	const enqueue = serialQueue();
	const apply = (direction: UndoDirection): Promise<UndoOutcome> =>
		enqueue(() => applyTop(deps, stacks, direction, changed).then((o) => announce(o, outcomeListeners, deps.notify)));
	return {
		record: recorderFor(stacks, deps.now ?? Date.now, changed),
		undo: () => apply("undo"),
		redo: () => apply("redo"),
		peek: () => ({ undo: summaryOf(stacks.undo), redo: summaryOf(stacks.redo) }),
		subscribe: (listener) => addTo(subscribers, listener),
		onOutcome: (listener) => addTo(outcomeListeners, listener),
		load: () => enqueue(() => loadInto(deps.store, stacks, changed, tell)),
		// Queued, like undo/redo: an apply in flight holds its step and file list, so
		// a path edit must wait for it to settle, then act on the settled stacks.
		onRename: (file, oldPath) => enqueue(() => rewriteAll(stacks, changed, (p) => renamedPath(p, file, oldPath))),
		onDelete: (file) => enqueue(() => dropAll(stacks, changed, (p) => isUnder(file, p))),
		pruneUnresolvable: () => enqueue(() => dropAll(stacks, changed, (p) => deps.app.vault.getFileByPath(p) === null)),
		dispose: () => {
			subscribers.clear();
			outcomeListeners.clear();
		},
	};
}

/** One notice per outcome: every listener gets it with the outcome, then `notify` shows it. */
function announce(outcome: UndoOutcome, listeners: ReadonlySet<OutcomeListener>, notify: (m: string) => void): UndoOutcome {
	const message = outcomeNotice(outcome);
	runEach(listeners, (l) => l(outcome, message));
	notify(message);
	return outcome;
}

/** A promise chain: each task starts after the previous one settled, and a rejection never blocks the next. */
function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => Promise<T>): Promise<T> => {
		const run = tail.then(task);
		tail = run.catch(() => undefined);
		return run;
	};
}

/** A rename's new path for `path`, or `path` itself when the rename does not touch it. */
function renamedPath(path: string, file: TAbstractFile, oldPath: string): string {
	if (path === oldPath) return file.path;
	// Folders only, and only below `oldPath + "/"`: "Notes" must not touch "Notes2/x.md".
	const below = file instanceof TFolder && path.startsWith(`${oldPath}/`);
	return below ? file.path + path.slice(oldPath.length) : path;
}

/** Whether a record at `path` is the deleted file, or sits under the deleted folder. */
function isUnder(file: TAbstractFile, path: string): boolean {
	return path === file.path || (file instanceof TFolder && path.startsWith(`${file.path}/`));
}

/**
 * Rewrite record paths on both stacks. Obsidian never renames onto an existing
 * note, so a record already at the new path in the same step is stale: the
 * renamed record wins and the stale one is dropped, keeping one record per path.
 */
async function rewriteAll(stacks: Stacks, changed: () => void, rename: (path: string) => string): Promise<void> {
	let touched = false;
	for (const stack of [stacks.undo, stacks.redo]) {
		stack.forEach((step, i) => {
			if (!step.files.some((f) => rename(f.path) !== f.path)) return;
			stack[i] = { ...step, files: renamedFiles(step.files, rename) };
			touched = true;
		});
	}
	if (touched) changed();
}

function renamedFiles(files: readonly FileChanges[], rename: (path: string) => string): FileChanges[] {
	const kept = files.filter((f) => rename(f.path) !== f.path || !files.some((o) => o !== f && rename(o.path) === f.path && rename(o.path) !== o.path));
	return kept.map((f) => ({ ...f, path: rename(f.path) }));
}

/** Drop the records whose path matches, then any step left with no files, on both stacks. */
async function dropAll(stacks: Stacks, changed: () => void, drop: (path: string) => boolean): Promise<void> {
	let touched = false;
	for (const stack of [stacks.undo, stacks.redo]) {
		const next: Step[] = [];
		for (const step of stack) {
			const files = step.files.filter((f) => !drop(f.path));
			if (files.length !== step.files.length) touched = true;
			if (files.length === step.files.length) next.push(step);
			else if (files.length > 0) next.push({ ...step, files });
		}
		stack.splice(0, stack.length, ...next);
	}
	if (touched) changed();
}

/** Each writer report becomes its own step (groups come in Phase 3). */
function recorderFor(stacks: Stacks, now: () => number, changed: () => void): WriteRecorder["record"] {
	let seq = 0;
	return (path, changes) => {
		if (changes.length === 0) return;
		const at = now();
		seq += 1;
		pushTrimmed(stacks.undo, stepWith({ id: `u-${at}-${seq}`, at }, [{ path, changes: [...changes] }]));
		stacks.redo.length = 0;
		changed();
	};
}

async function loadInto(store: JournalStore, stacks: Stacks, changed: () => void, tell: () => void): Promise<void> {
	const loaded: JournalSnapshot = await store.load();
	const fresh = stacks.undo.length === 0 && stacks.redo.length === 0;
	stacks.undo.splice(0, stacks.undo.length, ...[...loaded.undo, ...stacks.undo].slice(-MAX_STEPS));
	if (!fresh) return changed(); // the store's file must now include what was recorded meanwhile
	stacks.redo.splice(0, stacks.redo.length, ...loaded.redo.slice(-MAX_STEPS));
	tell();
}

/** One direction of apply on the top step of its stack (ADR-46, Complex Logic steps 3, 5–7). */
async function applyTop(deps: UndoJournalDeps, stacks: Stacks, dir: UndoDirection, changed: () => void): Promise<UndoOutcome> {
	const step = stacks[dir][stacks[dir].length - 1];
	if (step === undefined) return { kind: "empty", direction: dir };
	const r: ApplyResult = { moved: [], failed: [], vanished: [], conflicts: [] };
	for (const f of step.files) await applyFile(deps, f, dir, r);
	const moved = r.moved.length > 0 ? stepWith(step, r.moved) : null;
	const failed = r.failed.length > 0 ? stepWith(step, r.failed) : null;
	settleStacks(stacks, dir, step, moved, failed);
	if (moved !== null || r.vanished.length > 0) changed();
	if (moved !== null) {
		const failedPaths = r.failed.map((f) => f.path);
		return { kind: "applied", direction: dir, step: moved, conflicts: r.conflicts, failedPaths, vanishedPaths: r.vanished };
	}
	return failed !== null ? { kind: "failed", direction: dir, step: failed } : { kind: "vanished", direction: dir, paths: r.vanished };
}

/**
 * Take `step` off its stack by identity, not by popping: a write recorded while
 * the apply ran may sit above it, and on redo a new step may have cleared it.
 * The reduced step takes its place; the moved step goes on the other stack.
 */
function settleStacks(stacks: Stacks, dir: UndoDirection, step: Step, moved: Step | null, failed: Step | null): void {
	const src = stacks[dir];
	const at = src.indexOf(step);
	if (at !== -1) {
		if (failed !== null) src[at] = failed;
		else src.splice(at, 1);
	}
	if (moved !== null) pushTrimmed(stacks[dir === "undo" ? "redo" : "undo"], moved);
}

async function applyFile(deps: UndoJournalDeps, f: FileChanges, dir: UndoDirection, r: ApplyResult): Promise<void> {
	// getFileByPath, not getAbstractFileByPath: a folder at this path is not the note.
	const file = deps.app.vault.getFileByPath(f.path);
	if (file === null) {
		r.vanished.push(f.path);
		return;
	}
	const ops: RestoreOp[] = f.changes.map((c) => ({ key: c.key, target: dir === "undo" ? c.before : c.after }));
	const found = await tryRestore(deps, file, ops);
	if (found === null) {
		r.failed.push(f);
		return;
	}
	r.moved.push({ path: f.path, changes: f.changes.map((c, i) => reoriented(c, found[i] ?? ABSENT, dir)) });
	f.changes.forEach((c, i) => {
		const expected = dir === "undo" ? c.after : c.before;
		const got = found[i] ?? ABSENT;
		if (!slotsEqual(got, expected)) r.conflicts.push({ path: f.path, key: c.key, expected, found: got, written: ops[i]?.target ?? ABSENT });
	});
}

const ABSENT: Slot = { present: false };

/** The written slots, or null when the write failed (logged; the step stays). */
async function tryRestore(deps: UndoJournalDeps, file: TFile, ops: readonly RestoreOp[]): Promise<readonly Slot[] | null> {
	try {
		const found = await deps.restore()(file, ops);
		if (found.length !== ops.length) throw new Error(`restore answered ${found.length} slots for ${ops.length} keys`);
		return found;
	} catch (err) {
		console.warn(`[StoryForge] Undo journal: couldn't write ${file.path}; its change stays on the stack.`, err);
		return null;
	}
}

/** The moved step restores what THIS write overwrote (F3 AC2). */
function reoriented(c: FieldChange, found: Slot, dir: UndoDirection): FieldChange {
	return dir === "undo" ? { key: c.key, before: c.before, after: found } : { key: c.key, before: found, after: c.after };
}

/** A step with these files; `persist` follows the values it now holds (ADR-48). */
function stepWith(base: Pick<Step, "id" | "at">, files: readonly FileChanges[]): Step {
	const fits = (s: Slot): boolean => valueSize(s) <= MAX_VALUE_CHARS;
	const persist = files.every((f) => f.changes.every((c) => fits(c.before) && fits(c.after)));
	return { id: base.id, at: base.at, files, persist };
}

function pushTrimmed(stack: Step[], step: Step): void {
	stack.push(step);
	if (stack.length > MAX_STEPS) stack.splice(0, stack.length - MAX_STEPS);
}

function summaryOf(stack: readonly Step[]): StepSummary | null {
	const top = stack[stack.length - 1];
	return top === undefined ? null : summariseStep(top);
}

function addTo<T>(set: Set<T>, item: T): () => void {
	set.add(item);
	return () => {
		set.delete(item);
	};
}

/** Call each listener in isolation: one that throws is logged and the rest still run. */
function runEach<T>(listeners: ReadonlySet<T>, call: (listener: T) => void): void {
	for (const listener of [...listeners]) {
		try {
			call(listener);
		} catch (err) {
			console.warn("[StoryForge] Undo journal: a listener failed.", err);
		}
	}
}
