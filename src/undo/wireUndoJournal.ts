/**
 * wireUndoJournal — creates the undo journal and connects it to the plugin (spec 009 T2.7, ADR-43).
 *
 * Mirrors the FileClass cache precedent: built in `onload`, released through `register*`.
 * No key handler, buttons or settings UI here; later phases take the returned journal.
 */
import { Notice, type Plugin, type TAbstractFile, type Tasks } from "obsidian";
// Relative: the bare `inspector/...` alias reads as Node's builtin to import/no-nodejs-modules.
import { installWriteRecorder, type RestoreFn } from "../inspector/frontmatterWriter";
import { createJournalStore, undoJournalPath } from "undo/journalStore";
import { createUndoJournal, type OwnedUndoJournal } from "undo/undoJournal";

export interface UndoWiringHost extends Plugin {
	readonly settings: { readonly keepUndoHistory: boolean };
}

function warn(what: string): (err: unknown) => void {
	return (err) => { console.warn(`[StoryForge] Undo journal: ${what}.`, err); };
}

/** Flush the last change, then dispose. Runs once however many times it is asked for. */
function onceShutdown(journal: OwnedUndoJournal): () => Promise<void> {
	let running: Promise<void> | null = null;
	return () => (running ??= journal.flushNow()
		.catch(warn("the last save failed"))
		.finally(() => { journal.dispose(); }));
}

function registerCommands(plugin: Plugin, journal: OwnedUndoJournal): void {
	const run = (action: () => Promise<unknown>, verb: string): void => {
		action().catch((err: unknown) => {
			warn(`${verb} failed`)(err);
			new Notice(`Could not ${verb} the last Story Forge change.`);
		});
	};
	plugin.addCommand({
		id: "undo-last-change",
		// eslint-disable-next-line obsidianmd/commands/no-plugin-name-in-command-name, obsidianmd/ui/sentence-case -- the name is specified verbatim (spec 009 F5)
		name: "Undo last Story Forge change",
		callback: () => { run(() => journal.undo(), "undo"); },
	});
	plugin.addCommand({
		id: "redo-last-change",
		// eslint-disable-next-line obsidianmd/commands/no-plugin-name-in-command-name, obsidianmd/ui/sentence-case -- the name is specified verbatim (spec 009 F5)
		name: "Redo last Story Forge change",
		callback: () => { run(() => journal.redo(), "redo"); },
	});
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
 */
export async function wireUndoJournal(plugin: UndoWiringHost): Promise<OwnedUndoJournal> {
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
	const shutdown = onceShutdown(journal);
	// Obsidian's onunload is synchronous: stop recording now, finish the save in the background.
	plugin.register(() => {
		handle.uninstall();
		void shutdown();
	});
	// On quit the app waits for these tasks, so the last change reaches disk.
	plugin.registerEvent(app.workspace.on("quit", (tasks: Tasks) => { tasks.addPromise(shutdown()); }));
	registerVaultEvents(plugin, journal);
	registerCommands(plugin, journal);
	await journal.load().catch(warn("the stored history could not be read"));
	return journal;
}
