/**
 * journalTypes — the shared vocabulary of the undo journal (spec 009).
 *
 * Type-only: the writer (`frontmatterWriter.ts`) and the journal
 * (`undoJournal.ts`) both import from here, which keeps them from importing
 * each other. `JournalGroup`, `PendingReason` and `JournalStore` live here
 * rather than in `undoJournal.ts` for that reason (plan deviation, recorded).
 */

/** One frontmatter key's state: absent is not the same as an empty value. */
export type Slot = { readonly present: false } | { readonly present: true; readonly value: unknown };

export interface FieldChange {
	readonly key: string;
	/** What undo writes back. */
	readonly before: Slot;
	/** What undo expects to find, and what redo writes. */
	readonly after: Slot;
}

export interface FileChanges {
	readonly path: string;
	readonly changes: readonly FieldChange[];
}

export interface Step {
	readonly id: string;
	readonly at: number;
	readonly files: readonly FileChanges[];
	/** false when any value exceeds MAX_VALUE_CHARS: kept this session, never persisted (ADR-48). */
	readonly persist: boolean;
}

export interface StepSummary {
	readonly label: string;
	readonly fieldCount: number;
	readonly noteCount: number;
}

export interface ConflictReport {
	readonly path: string;
	readonly key: string;
	/** What the step expected to find. */
	readonly expected: Slot;
	/** What was actually there. */
	readonly found: Slot;
	/** What the undo/redo wrote over it. */
	readonly written: Slot;
}

export type UndoDirection = "undo" | "redo";

export type UndoOutcome =
	| {
			kind: "applied";
			direction: UndoDirection;
			/** The part of the step that was applied. */
			step: Step;
			conflicts: readonly ConflictReport[];
			failedPaths: readonly string[];
			vanishedPaths: readonly string[];
	  }
	| { kind: "empty"; direction: UndoDirection }
	| { kind: "refused"; direction: UndoDirection; path: string; reason: "draft" | "write" }
	| { kind: "failed"; direction: UndoDirection; step: Step }
	| { kind: "vanished"; direction: UndoDirection; paths: readonly string[] };

/** Why a note cannot be undone right now: unsaved text, or a write in flight or pending. */
export type PendingReason = "draft" | "write";

/** Does this vault path have unsaved text, or a write in flight or pending? (ADR-39) */
export type PendingProbe = (path: string) => PendingReason | null;

export interface JournalGroup {
	readonly id: string;
	/** Another holder joins (nesting = join). Each join needs one close. */
	join(): JournalGroup;
	/** The group commits only after `p` settles (resolved or rejected). Returns `p`. */
	track<T>(p: Promise<T>): Promise<T>;
	/** Release one hold. At zero holds and zero unsettled tracked promises, the step commits. */
	close(): void;
	/** Resolves once the group has committed (or was empty). */
	readonly settled: Promise<void>;
}

/** Both stacks, oldest first, top of stack last. */
export interface JournalSnapshot {
	readonly undo: readonly Step[];
	readonly redo: readonly Step[];
}

/**
 * What the journal needs from its persistence file (ADR-40, ADR-48). The
 * store owns validation, the size cap and the write schedule; the journal
 * only hands over snapshots. Steps with `persist: false` are never written.
 */
export interface JournalStore {
	/** Empty snapshot when the file is missing, unreadable or invalid (the store warns). */
	load(): Promise<JournalSnapshot>;
	/** Schedule a debounced save of the whole snapshot. */
	save(snapshot: JournalSnapshot): void;
	/** Write any scheduled save now. */
	flushNow(): Promise<void>;
	/** Delete the file and cancel any scheduled save. */
	remove(): Promise<void>;
}
