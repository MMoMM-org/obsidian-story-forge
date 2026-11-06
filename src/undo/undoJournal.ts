/**
 * undoJournal — the two stacks behind "Undo/Redo last change" (spec 009).
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
 * Before choosing a step, undo/redo run the registered flushers, wait for open groups, then ask
 * the probes about every path of the top step; a busy note refuses and writes nothing (ADR-39).
 *
 * Built so far (T3.4): record, stacks, apply, outcomes, `load` from the store, path upkeep
 * (rename, delete, startup prune), the persistence gate with `flushNow`, gesture groups
 * (ADR-38), probes with flushers, and `settle` for the shutdown. Still to come: `clear` (T5.5).
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-46, ADR-48, Complex Logic
 */
import { TFolder, type App, type TAbstractFile, type TFile } from "obsidian";
import type { RestoreFn, RestoreOp, WriteRecorder } from "../inspector/frontmatterWriter";
import type {
	ConflictReport, FieldChange, FileChanges, JournalSnapshot, JournalStore, Slot, Step, StepSummary,
	JournalGroup, PendingProbe, UndoDirection, UndoOutcome,
} from "undo/journalTypes";
import { outcomeNotice, summariseStep } from "undo/stepLabel";
import { slotsEqual, valueSize } from "undo/yamlValue";

/** Steps kept per stack; the oldest is dropped (ADR-48). */
export const MAX_STEPS = 50;
/** A step holding a longer value (JSON length) is kept this session but never persisted (ADR-48). */
export const MAX_VALUE_CHARS = 16_384;

/** An unclosed group force-commits after this long, with a warning (ADR-38). */
export const GROUP_TIMEOUT_MS = 10_000;

export interface StackPeek {
	readonly undo: StepSummary | null;
	readonly redo: StepSummary | null;
}

export type OutcomeListener = (outcome: UndoOutcome, message: string) => void;

export interface UndoJournal {
	/** Open a gesture group: writes passing it collect into one step (ADR-38). */
	openGroup(): JournalGroup;
	/** Open a group, await `fn`, close it in `finally`. */
	group<T>(fn: (g: JournalGroup) => Promise<T>): Promise<T>;
	/** Ask `probe` about every path of a step before it is applied. @returns the call that removes it */
	registerProbe(probe: PendingProbe): () => void;
	/**
	 * Run `flush` (and await it) before each undo/redo picks its step. @returns the call that removes it
	 * A flusher may write, but must not call `undo`/`redo` itself: it runs inside their queue.
	 */
	registerFlusher(flush: () => Promise<void>): () => void;
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
	/**
	 * Persistence on or off: off deletes the file and stops saving; on saves the current state.
	 *
	 * Not guarded against running before `load()`: with persistence off at startup `load()` reads
	 * nothing, and switching on later must save the in-memory state (the file was deleted when it
	 * went off). A caller that has persistence on at startup must `await load()` before it wires
	 * the settings toggle, or this save would replace the stored history before it is read.
	 */
	setPersistence(on: boolean): Promise<void>;
	/**
	 * Finish pending gestures: run the flushers, then wait until no group is open (the
	 * pre-apply part of undo/redo, queued like them). Writes nothing itself. Shutdown runs
	 * it before `flushNow`, so a gesture still pending at unload is in the saved state;
	 * `dispose` would commit an open group without saving it.
	 */
	settle(): Promise<void>;
	/** Write any pending save now (no-op with persistence off). */
	flushNow(): Promise<void>;
	/**
	 * Drop every listener and stop asking the store to save: no new save follows, not even from an
	 * apply in flight. It does not flush. A save the store has already debounced stays pending
	 * there, and is written only by the store's own timer or `flushNow`.
	 *
	 * Unload order: `await journal.flushNow()` first, then `journal.dispose()`. Disposing first
	 * makes `flushNow` a no-op, so the last change (up to the debounce window) is lost.
	 */
	dispose(): void;
}

export interface UndoJournalDeps {
	readonly app: App;
	/** Late-bound: `installWriteRecorder` runs after the journal exists. */
	readonly restore: () => RestoreFn;
	readonly store: JournalStore;
	/** Whether the history is kept across restarts (`settings.keepUndoHistory`). Read once, then `setPersistence` rules. */
	readonly persist: () => boolean;
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
	const gate: Gate = { on: null, disposed: false, loaded: false };
	const persisting = (): boolean => !gate.disposed && (gate.on ??= deps.persist());
	const saveNow = (): void => deps.store.save({ undo: [...stacks.undo], redo: [...stacks.redo] });
	const changed = (): void => {
		if (persisting()) saveNow();
		tell();
	};
	const notify = (message: string): void => isolated(() => deps.notify(message), "notify failed");
	const enqueue = serialQueue();
	const pushStep = stepPusher(stacks, deps.now ?? Date.now, changed);
	const groups = createGroups(pushStep);
	const probes = new Set<PendingProbe>();
	const flushers = new Set<() => Promise<void>>();
	const settlePending = async (): Promise<void> => {
		await runFlushers(flushers);
		await groups.idle();
	};
	const apply = (direction: UndoDirection): Promise<UndoOutcome> =>
		enqueue(async () => {
			await settlePending();
			const refused = refusal(stacks[direction][stacks[direction].length - 1], probes, direction);
			const outcome = refused ?? (await applyTop(deps, stacks, direction, changed));
			return announce(outcome, outcomeListeners, notify);
		});
	return {
		record: (path, changes, group) => {
			if (changes.length === 0) return;
			if (group !== undefined && groups.add(group, path, changes)) return;
			if (group !== undefined) console.warn("[StoryForge] Undo journal: a write named a group that is closed or unknown; it becomes its own step.");
			pushStep([{ path, changes: [...changes] }]);
		},
		openGroup: () => groups.open(),
		group: async (fn) => {
			const g = groups.open();
			try {
				return await fn(g);
			} finally {
				g.close();
			}
		},
		registerProbe: (probe) => addTo(probes, probe),
		registerFlusher: (flush) => addTo(flushers, flush),
		undo: () => apply("undo"),
		redo: () => apply("redo"),
		peek: () => ({ undo: summaryOf(stacks.undo), redo: summaryOf(stacks.redo) }),
		subscribe: (listener) => addTo(subscribers, listener),
		onOutcome: (listener) => addTo(outcomeListeners, listener),
		load: () => enqueue(() => (persisting() && !gate.loaded ? loadInto(deps.store, stacks, changed, tell, gate) : undefined)),
		setPersistence: (on) => {
			gate.on = on;
			if (on) saveNow();
			return on ? Promise.resolve() : deps.store.remove();
		},
		settle: () => enqueue(settlePending),
		flushNow: () => (persisting() ? deps.store.flushNow() : Promise.resolve()),
		// Queued, like undo/redo: an apply in flight holds its step and file list, so
		// a path edit must wait for it to settle, then act on the settled stacks.
		onRename: (file, oldPath) => enqueue(() => rewriteAll(stacks, changed, (p) => renamedPath(p, file, oldPath))),
		onDelete: (file) => enqueue(() => dropAll(stacks, changed, (p) => isUnder(file, p))),
		pruneUnresolvable: () => enqueue(() => dropAll(stacks, changed, (p) => deps.app.vault.getFileByPath(p) === null)),
		dispose: () => {
			gate.disposed = true;
			subscribers.clear();
			outcomeListeners.clear();
			probes.clear();
			flushers.clear();
			groups.closeAll();
		},
	};
}

/** Run every flusher at once and wait for all; one that fails is logged and the rest still count. */
async function runFlushers(flushers: ReadonlySet<() => Promise<void>>): Promise<void> {
	const runs = [...flushers].map(async (flush) => {
		try {
			await flush();
		} catch (err) {
			console.warn("[StoryForge] Undo journal: a flusher failed; continuing.", err);
		}
	});
	await Promise.all(runs);
}

/**
 * The refusal for `step`, or null when no probe reports its notes busy. Paths go in step order,
 * probes in registration order; the first busy answer wins. No step: nothing to refuse.
 */
function refusal(step: Step | undefined, probes: ReadonlySet<PendingProbe>, dir: UndoDirection): UndoOutcome | null {
	if (step === undefined) return null;
	for (const { path } of step.files) {
		for (const probe of probes) {
			const reason = askProbe(probe, path);
			if (reason !== null) return { kind: "refused", direction: dir, path, reason };
		}
	}
	return null;
}

/** A probe that throws counts as not busy: it is logged, and undo is not held hostage by it. */
function askProbe(probe: PendingProbe, path: string): ReturnType<PendingProbe> {
	try {
		return probe(path);
	} catch (err) {
		console.warn(`[StoryForge] Undo journal: a pending-work probe failed for ${path}; treating it as not busy.`, err);
		return null;
	}
}

/** One notice per outcome: every listener gets it with the outcome, then `notify` shows it. */
function announce(outcome: UndoOutcome, listeners: ReadonlySet<OutcomeListener>, notify: (m: string) => void): UndoOutcome {
	const message = outcomeNotice(outcome);
	runEach(listeners, (l) => l(outcome, message));
	notify(message);
	return outcome;
}

/** A promise chain: each task starts after the previous one settled, and a rejection never blocks the next. */
function serialQueue(): <T>(task: () => T | Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => T | Promise<T>): Promise<T> => {
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
function rewriteAll(stacks: Stacks, changed: () => void, rename: (path: string) => string): void {
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

/** A record that stays put but sits where another record in the step is being renamed to: the renamed one wins. */
function isStaleTarget(f: FileChanges, files: readonly FileChanges[], rename: (path: string) => string): boolean {
	if (rename(f.path) !== f.path) return false;
	return files.some((o) => o !== f && rename(o.path) !== o.path && rename(o.path) === f.path);
}

function renamedFiles(files: readonly FileChanges[], rename: (path: string) => string): FileChanges[] {
	const kept = files.filter((f) => !isStaleTarget(f, files, rename));
	return kept.map((f) => ({ ...f, path: rename(f.path) }));
}

/** Drop the records whose path matches, then any step left with no files, on both stacks. */
function dropAll(stacks: Stacks, changed: () => void, drop: (path: string) => boolean): void {
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

/** Put one step on top of undo (clears redo, caps the stack, saves, notifies). Nothing to record: no-op. */
function stepPusher(stacks: Stacks, now: () => number, changed: () => void): (files: readonly FileChanges[]) => void {
	let seq = 0;
	return (files) => {
		if (files.length === 0) return;
		const at = now();
		seq += 1;
		pushTrimmed(stacks.undo, stepWith({ id: `u-${at}-${seq}`, at }, files));
		stacks.redo.length = 0;
		changed();
	};
}

/** What a group has collected so far: per file, per key, in first-write order. */
interface GroupState {
	holds: number;
	pending: number;
	done: boolean;
	timer: number | undefined;
	readonly settled: Promise<void>;
	readonly files: Map<string, Map<string, FieldChange>>;
	finish(): void;
}

interface Groups {
	open(): JournalGroup;
	/** Collect the changes; false when `group` is not open here (unknown or already committed). */
	add(group: JournalGroup, path: string, changes: readonly FieldChange[]): boolean;
	closeAll(): void;
	/** Resolves once no group is open, including groups opened while it waited. */
	idle(): Promise<void>;
}

/** Gesture groups (ADR-38): ref-counted holds plus tracked promises; the merged step is pushed once. */
function createGroups(pushStep: (files: readonly FileChanges[]) => void): Groups {
	const open = new Set<GroupState>();
	const states = new WeakMap<JournalGroup, GroupState>();
	let seq = 0;
	const create = (): JournalGroup => {
		seq += 1;
		let resolve!: () => void;
		const settled = new Promise<void>((r) => (resolve = r));
		const state: GroupState = {
			holds: 1, pending: 0, done: false, timer: undefined, settled, files: new Map(),
			finish: () => {
				if (state.done) return;
				state.done = true;
				window.clearTimeout(state.timer);
				open.delete(state);
				try {
					pushStep(mergedFiles(state.files));
				} finally {
					resolve();
				}
			},
		};
		const settle = (): void => {
			state.pending -= 1;
			commitIfIdle(state);
		};
		const handle: JournalGroup = {
			id: `g-${seq}`,
			join: () => {
				state.holds += 1;
				return handle;
			},
			// `p.then(settle, settle)` marks p as handled, so a rejection the caller drops is not reported as unhandled.
			track: (p) => {
				state.pending += 1;
				p.then(settle, settle);
				return p;
			},
			close: () => {
				if (state.holds === 0) return;
				state.holds -= 1;
				commitIfIdle(state);
			},
			settled,
		};
		state.timer = window.setTimeout(() => {
			console.warn(`[StoryForge] Undo journal: group ${handle.id} was still open after ${GROUP_TIMEOUT_MS} ms; committing it now.`);
			state.finish();
		}, GROUP_TIMEOUT_MS);
		states.set(handle, state);
		open.add(state);
		return handle;
	};
	return {
		open: create,
		add: (group, path, changes) => {
			const state = states.get(group);
			if (state === undefined || state.done) return false;
			collect(state.files, path, changes);
			return true;
		},
		closeAll: () => [...open].forEach((s) => s.finish()),
		idle: async () => {
			while (open.size > 0) await Promise.all([...open].map((s) => s.settled));
		},
	};
}

function commitIfIdle(state: GroupState): void {
	if (state.holds === 0 && state.pending === 0) state.finish();
}

/** Same key twice: the first `before` stays, the last `after` wins (Implementation Gotchas). */
function collect(files: Map<string, Map<string, FieldChange>>, path: string, changes: readonly FieldChange[]): void {
	const keys = files.get(path) ?? new Map<string, FieldChange>();
	files.set(path, keys);
	for (const c of changes) keys.set(c.key, { key: c.key, before: keys.get(c.key)?.before ?? c.before, after: c.after });
}

/** The collected changes minus those that ended where they began, and files left with none. */
function mergedFiles(files: ReadonlyMap<string, ReadonlyMap<string, FieldChange>>): FileChanges[] {
	const merged: FileChanges[] = [];
	for (const [path, keys] of files) {
		const changes = [...keys.values()].filter((c) => !slotsEqual(c.before, c.after));
		if (changes.length > 0) merged.push({ path, changes });
	}
	return merged;
}

/** Journal-wide switches: persistence (null = ask `deps.persist` once), dispose, and whether the file was taken. */
interface Gate {
	on: boolean | null;
	disposed: boolean;
	loaded: boolean;
}

async function loadInto(store: JournalStore, stacks: Stacks, changed: () => void, tell: () => void, gate: Gate): Promise<void> {
	const loaded: JournalSnapshot = await store.load();
	gate.loaded = true; // only a load that read the file counts, so a failed one can be retried
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
	return { id: base.id, at: base.at, files, persist: fitsPersistLimit(files) };
}

/** True when no value in `files` is longer than MAX_VALUE_CHARS (ADR-48). */
export function fitsPersistLimit(files: readonly FileChanges[]): boolean {
	const fits = (s: Slot): boolean => valueSize(s) <= MAX_VALUE_CHARS;
	return files.every((f) => f.changes.every((c) => fits(c.before) && fits(c.after)));
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

/** Run one callback; a throw is logged and goes no further. */
function isolated(call: () => void, what: string): void {
	try {
		call();
	} catch (err) {
		console.warn(`[StoryForge] Undo journal: ${what}.`, err);
	}
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
