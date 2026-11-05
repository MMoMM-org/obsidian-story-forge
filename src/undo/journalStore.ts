/**
 * journalStore — the `undo-journal.json` file (spec 009 T2.6, ADR-40, ADR-48).
 *
 * The only writer of the file. Validates it strictly on load (any doubt means an
 * empty snapshot and one warning, never a throw), serialises steps with
 * `persist !== false` within a 1 MiB cap, and debounces saves by 1 s. A failed
 * read, write or remove is a warning: no throw crosses the journal boundary.
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — Data Storage Changes, ADR-48
 */
import { debounce, normalizePath } from "obsidian";
import type { FieldChange, FileChanges, JournalSnapshot, JournalStore, Slot, Step } from "undo/journalTypes";

/** The file may not exceed this many characters (ADR-48). */
export const MAX_FILE_CHARS = 1_048_576;
/** A save waits this long after the last change (ADR-48). */
export const SAVE_DEBOUNCE_MS = 1_000;
const FILE_VERSION = 1;
const EMPTY: JournalSnapshot = { undo: [], redo: [] };

/** The part of `vault.adapter` (obsidian.d.ts DataAdapter) the store uses. */
export interface StoreAdapter {
	read(normalizedPath: string): Promise<string>;
	write(normalizedPath: string, data: string): Promise<void>;
	exists(normalizedPath: string): Promise<boolean>;
	remove(normalizedPath: string): Promise<void>;
}

export interface JournalStoreDeps {
	readonly adapter: StoreAdapter;
	/** Vault-relative path of the file; see `undoJournalPath`. */
	readonly path: string;
	readonly now?: () => number;
	readonly debounceMs?: number;
}

/** `<manifest.dir>/undo-journal.json`, or under `<configDir>/plugins/<id>` when `dir` is unset (ADR-40). */
export function undoJournalPath(manifest: { readonly id: string; readonly dir?: string }, configDir: string): string {
	const dir = manifest.dir ?? `${configDir}/plugins/${manifest.id}`;
	return normalizePath(`${dir}/undo-journal.json`);
}

export function createJournalStore(deps: JournalStoreDeps): JournalStore {
	const now = deps.now ?? Date.now;
	let pending: JournalSnapshot | null = null;
	let chain: Promise<void> = Promise.resolve();
	const onChain = (task: () => Promise<void>): Promise<void> => {
		// A task that rejects is logged and absorbed, so the chain itself never stays rejected.
		chain = chain.then(task).catch((err: unknown) => {
			console.warn("[StoryForge] Undo journal: a history file task failed.", err);
		});
		return chain;
	};
	const writePending = (): Promise<void> => {
		const snapshot = pending;
		pending = null;
		if (snapshot === null) return chain;
		return onChain(() => writeFile(deps, snapshot, now()));
	};
	const scheduled = debounce(() => void writePending(), deps.debounceMs ?? SAVE_DEBOUNCE_MS, true);
	return {
		load: () => loadFile(deps),
		save: (snapshot) => {
			pending = snapshot;
			scheduled();
		},
		flushNow: () => {
			scheduled.cancel();
			return writePending();
		},
		remove: () => {
			scheduled.cancel();
			pending = null;
			return onChain(() => removeFile(deps));
		},
	};
}

async function writeFile(deps: JournalStoreDeps, snapshot: JournalSnapshot, savedAt: number): Promise<void> {
	try {
		// Serialising can throw (a BigInt or cyclic value), so it belongs inside the try.
		await deps.adapter.write(deps.path, serialise(snapshot, savedAt));
	} catch (err) {
		console.warn("[StoryForge] Undo journal: couldn't save the history file; it stays in memory.", err);
	}
}

async function removeFile(deps: JournalStoreDeps): Promise<void> {
	try {
		if (await deps.adapter.exists(deps.path)) await deps.adapter.remove(deps.path);
	} catch (err) {
		console.warn("[StoryForge] Undo journal: couldn't delete the history file.", err);
	}
}

async function loadFile(deps: JournalStoreDeps): Promise<JournalSnapshot> {
	try {
		if (!(await deps.adapter.exists(deps.path))) return EMPTY;
		const parsed = parseFile(await deps.adapter.read(deps.path));
		if (parsed !== null) return parsed;
		console.warn("[StoryForge] Undo journal: the history file is invalid; starting with an empty history.");
	} catch (err) {
		console.warn("[StoryForge] Undo journal: couldn't read the history file; starting with an empty history.", err);
	}
	return EMPTY;
}

// --- serialising ---------------------------------------------------------

/**
 * The file text. Steps are taken undo newest-first, then redo newest-first,
 * until the next one would not fit; older steps are left out (ADR-48), so the
 * undo stack, which the user reaches for first, is kept before redo.
 */
function serialise(snapshot: JournalSnapshot, savedAt: number): string {
	const budget = { used: JSON.stringify({ version: FILE_VERSION, savedAt, undo: [], redo: [] }).length, full: false };
	const undo = takeWithin(budget, snapshot.undo);
	const redo = takeWithin(budget, snapshot.redo);
	return JSON.stringify({ version: FILE_VERSION, savedAt, undo: undo.map(persisted), redo: redo.map(persisted) });
}

interface Budget {
	used: number;
	full: boolean;
}

/** The newest persistable steps of `stack` that still fit; spends from `budget`, which stays full once a step is refused. */
function takeWithin(budget: Budget, stack: readonly Step[]): Step[] {
	const persistable = stack.filter((s) => s.persist);
	const kept: Step[] = [];
	for (const step of persistable.reverse()) {
		const cost = JSON.stringify(persisted(step)).length + (kept.length > 0 ? 1 : 0); // the comma before all but a stack's first
		if (budget.full || budget.used + cost > MAX_FILE_CHARS) {
			budget.full = true;
			break;
		}
		budget.used += cost;
		kept.unshift(step);
	}
	return kept;
}

function persisted(step: Step): unknown {
	return { id: step.id, at: step.at, files: step.files.map((f) => ({ path: f.path, changes: f.changes.map(persistedChange) })) };
}

function persistedChange(c: FieldChange): unknown {
	return { key: c.key, before: persistedSlot(c.before), after: persistedSlot(c.after) };
}

function persistedSlot(s: Slot): unknown {
	return s.present ? { v: s.value } : {};
}

// --- validating ----------------------------------------------------------

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;

/** The snapshot, or null when the text is not a valid version-1 file. */
function parseFile(text: string): JournalSnapshot | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isObject(raw) || raw.version !== FILE_VERSION) return null;
	const ids = new Set<string>();
	const undo = parseStack(raw.undo, ids);
	const redo = parseStack(raw.redo, ids);
	return undo === null || redo === null ? null : { undo, redo };
}

function parseStack(raw: unknown, ids: Set<string>): Step[] | null {
	if (!Array.isArray(raw)) return null;
	const steps: Step[] = [];
	for (const item of raw) {
		const step = parseStep(item);
		if (step === null || ids.has(step.id)) return null;
		ids.add(step.id);
		steps.push(step);
	}
	return steps;
}

function parseStep(raw: unknown): Step | null {
	if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.at !== "number" || !Number.isFinite(raw.at)) return null;
	if (!isNonEmptyArray(raw.files)) return null;
	const files = raw.files.map(parseFileChanges);
	if (files.some((f) => f === null)) return null;
	return { id: raw.id, at: raw.at, files: files as FileChanges[], persist: true };
}

function parseFileChanges(raw: unknown): FileChanges | null {
	if (!isObject(raw) || typeof raw.path !== "string" || raw.path === "" || !isNonEmptyArray(raw.changes)) return null;
	const changes = raw.changes.map(parseChange);
	if (changes.some((c) => c === null)) return null;
	return { path: raw.path, changes: changes as FieldChange[] };
}

function parseChange(raw: unknown): FieldChange | null {
	if (!isObject(raw) || typeof raw.key !== "string") return null;
	const before = parseSlot(raw.before);
	const after = parseSlot(raw.after);
	return before === null || after === null ? null : { key: raw.key, before, after };
}

/** `{}` is an absent key, `{"v": x}` a present one; anything else is malformed. */
function parseSlot(raw: unknown): Slot | null {
	if (!isObject(raw)) return null;
	const keys = Object.keys(raw);
	if (keys.length === 0) return { present: false };
	return keys.length === 1 && keys[0] === "v" ? { present: true, value: raw.v } : null;
}
