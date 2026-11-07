/**
 * wireUndoJournal — creates the undo journal and connects it to the plugin (spec 009 T2.7, ADR-43).
 *
 * Mirrors the FileClass cache precedent: built in `onload`, released through `register*`.
 * Also wires the palette commands and the global Mod+Z handler (T5.4, ADR-37); the buttons and
 * settings UI take the returned journal.
 */
import { Notice, type Plugin, type TAbstractFile, type Tasks } from "obsidian";
// Relative: the bare `inspector/...` alias reads as Node's builtin to import/no-nodejs-modules.
import { installWriteRecorder, type RestoreFn } from "../inspector/frontmatterWriter";
import { createJournalStore, undoJournalPath } from "undo/journalStore";
import type { UndoDirection } from "undo/journalTypes";
import { reportRejectedUndo } from "undo/undoNotice";
import { createUndoJournal, type OwnedUndoJournal } from "undo/undoJournal";
import { createUndoKeyHandler, type UndoKeyHost } from "undo/undoKeys";

export interface UndoWiringHost extends Plugin {
	readonly settings: { readonly keepUndoHistory: boolean };
}

function warn(what: string): (err: unknown) => void {
	return (err) => { console.warn(`[StoryForge] Undo journal: ${what}.`, err); };
}

/**
 * Settle pending gestures, stop recording, save, dispose. Runs once however many times it is
 * asked for (unload and quit both ask).
 *
 * `settle` comes first and the recorder stays installed through it: a Kanban write still
 * debounced at shutdown is flushed into its group and recorded, so `flushNow` saves it. This
 * holds whether Obsidian closes the views before or after `onunload` (T3.4).
 */
function onceShutdown(journal: OwnedUndoJournal, uninstall: () => void): () => Promise<void> {
	let running: Promise<void> | null = null;
	return () => (running ??= journal.settle()
		.catch(warn("pending changes could not be settled"))
		.finally(uninstall)
		.then(() => journal.flushNow())
		.catch(warn("the last save failed"))
		.finally(() => { journal.dispose(); }));
}

/** ADR-53: a command this soon after a key trigger is the same keystroke reaching a user hotkey. */
const KEY_COMMAND_GAP_MS = 100;

type Run = (direction: UndoDirection) => void;

/** One undo/redo entry point per trigger; the command one drops a run right after a key one. */
function createTriggers(journal: OwnedUndoJournal): { fromKey: Run; fromCommand: Run } {
	let lastKeyTriggerAt = Number.NEGATIVE_INFINITY;
	const run: Run = (direction) => {
		journal[direction]().catch((err: unknown) => { reportRejectedUndo(direction, err); });
	};
	return {
		fromKey: (direction) => { lastKeyTriggerAt = Date.now(); run(direction); },
		fromCommand: (direction) => {
			if (Date.now() - lastKeyTriggerAt < KEY_COMMAND_GAP_MS) return;
			run(direction);
		},
	};
}

function registerCommands(plugin: Plugin, run: Run): void {
	plugin.addCommand({
		id: "undo-last-change",
		name: "Undo last change",
		callback: () => { run("undo"); },
	});
	plugin.addCommand({
		id: "redo-last-change",
		name: "Redo last change",
		callback: () => { run("redo"); },
	});
}

/** ADR-37: capture-phase keydown on the main document and on every popout's. */
function registerUndoKeys(plugin: Plugin, activeHost: () => UndoKeyHost | null, run: Run): void {
	const handler = createUndoKeyHandler({ activeHost, undo: () => { run("undo"); }, redo: () => { run("redo"); } });
	plugin.registerDomEvent(activeDocument, "keydown", handler, { capture: true });
	plugin.registerEvent(plugin.app.workspace.on("window-open", (_w, win: Window) => {
		plugin.registerDomEvent(win.document, "keydown", handler, { capture: true });
	}));
}

function registerVaultEvents(plugin: Plugin, journal: OwnedUndoJournal): void {
	const { vault, workspace } = plugin.app;
	plugin.registerEvent(vault.on("rename", (file: TAbstractFile, oldPath: string) => {
		journal.onRename(file, oldPath).catch(warn("a rename could not be followed"));
	}));
	plugin.registerEvent(vault.on("delete", (file: TAbstractFile) => {
		journal.onDelete(file).catch(warn("a delete could not be followed"));
	}));
	// Records for notes renamed or deleted while the plugin was off: the vault index must be ready.
	workspace.onLayoutReady(() => {
		journal.pruneUnresolvable().catch(warn("pruning failed"));
	});
}

/**
 * Create, install and load the journal. Resolves once the stored history is read, so nothing
 * that toggles persistence (the settings tab, wired after this) can overtake the load.
 * Call after the settings are loaded: `persist` reads `settings.keepUndoHistory`.
 * `activeHost` names the Anvil or Workbench when it is the active view, for the Mod+Z handler.
 */
export async function wireUndoJournal(
	plugin: UndoWiringHost,
	activeHost: () => UndoKeyHost | null,
): Promise<OwnedUndoJournal> {
	const { app } = plugin;
	const store = createJournalStore({
		adapter: app.vault.adapter,
		path: undoJournalPath(plugin.manifest, app.vault.configDir),
	});
	let restore: RestoreFn | null = null;
	const journal = createUndoJournal({
		app,
		restore: () => {
			if (restore === null) throw new Error("[StoryForge] Undo journal used before the recorder was installed.");
			return restore;
		},
		store,
		persist: () => plugin.settings.keepUndoHistory,
		notify: (message) => { new Notice(message); },
	});
	const handle = installWriteRecorder(app, journal);
	restore = handle.restore;
	const shutdown = onceShutdown(journal, () => { handle.uninstall(); });
	// Obsidian's onunload is synchronous: settle, save and stop recording in the background.
	plugin.register(() => { void shutdown(); });
	// On quit the app waits for these tasks, so the last change reaches disk.
	plugin.registerEvent(app.workspace.on("quit", (tasks: Tasks) => { tasks.addPromise(shutdown()); }));
	registerVaultEvents(plugin, journal);
	const triggers = createTriggers(journal);
	registerCommands(plugin, triggers.fromCommand);
	registerUndoKeys(plugin, activeHost, triggers.fromKey);
	await journal.load().catch(warn("the stored history could not be read"));
	return journal;
}
