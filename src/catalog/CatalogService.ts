/**
 * CatalogService — T4.4 curated-catalog install, verify, materialise, persist.
 * Record shape reworked at T3.3 to close the double-copy defect (ADR-35).
 *
 * The CatalogIndex is provided via constructor injection (never read from dist/
 * at runtime) so this service is fully testable without build artifacts.
 *
 * Install order (SDD Runtime View — curated-install algorithm):
 *   1. VERIFY      — computeChecksum(entry.source) vs entry.checksum; fail-closed
 *                    on mismatch (nothing written, reason surfaced).
 *   2. MATERIALISE — write raw .base YAML into curatedBasesFolder,
 *                    normalizePath'd; create folder on demand. The vault file is
 *                    the single copy of the YAML.
 *   3. PERSIST     — store.setRecord with engine:"bases", kind:"collection",
 *                    source:<vault path — NOT the YAML>, provenance:"curated",
 *                    okayed:{checksum}, and a `generated` block (ADR-35) carrying
 *                    the two-checksum bookkeeping `classify()`
 *                    (src/library/baseGenerator.ts) needs to tell "clean" apart
 *                    from "a foreign hand edited the file".
 *   If PERSIST fails after MATERIALISE, the write is undone (a new file removed, a
 *   replaced one restored) so no partial state is left. An Update replaces the
 *   stale record in place and refuses when the user edited the installed file
 *   (T7.2). install() NEVER throws — always returns InstallResult.
 *
 * Why the record no longer stores the YAML (ADR-35, closes the double-copy defect):
 *   Storing `record.source` as a second copy of the YAML meant drift detection
 *   (ConsentGate._evaluateBasesRecord) checksummed the STORE's copy while
 *   the removed Open Codex command opened the VAULT file — editing the rendered file was invisible.
 *   The vault file is now the single artifact; `record.source` is its path, and
 *   `record.generated.instanceChecksum` is the checksum of the bytes actually
 *   written, so classify() can detect a hand-edit against what is really on disk.
 *
 * The renderer half of ADR-35 (closed in T7.1): BasesFenceEngine branches on
 * `kind` and reads the vault file for a kind:"collection" record, so the path
 * stored in `source` never reaches the YAML parser. ConsentGate reads
 * `record.generated` instead of checksumming `source` (ConsentGate.ts).
 *
 * Why bases entries bypass importToStore (ADR-5):
 *   ViewDefinition.engine is typed "dataview-dql"|"dataviewjs" — "bases" is not
 *   in the union. Routing through toRecord() would either (a) require lying about
 *   the engine or (b) require touching src/import/* in a way that risks T4.3
 *   regressions. Writing directly is the minimal, correct path.
 *
 * T7.2: the catalog also emits curated Dataview notes (engine "dataview-dql" /
 * "dataviewjs"), installed by `_installDataviewEntry` into the same folder. An
 * exhaustive guard ensures a future CatalogEntry variant fails to compile until handled.
 *
 * Out of scope here (see plan/phase-3.md T3.3 / T7.3): `renderBase`'s output
 * shape and wiring `sourceChecksum` to a real template producer — the catalog
 * entry's own checksum is stored honestly instead, and `classify()`'s
 * `reconsent` branch stays inert until T7.3.
 *
 * HAZARD this leaves open (see the constructor's `collectionParams` deps and
 * main.ts's placeholder): curated entries are written VERBATIM by
 * `_materialise` — `renderBase` is never invoked to produce them — so
 * `generated.params` on a curated record does NOT describe the bytes on disk.
 * It is bookkeeping for a future render, not a description of the past write.
 * Once the injected params change, an unedited curated file classifies
 * "regenerate" and its curated content would be replaced by `renderBase`
 * output. T7.3 owns this: reconcile already-installed records'
 * `generated.params` when it wires real settings-backed values. A hand-edited
 * file is safe either way — it classifies "ask" (see `classify()`).
 *
 * @ref PRD/AC-F4.5 (fail-closed on mismatch)
 * @ref PRD/AC-F4.6 (surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline — zero network on any path, CON-9)
 * @ref SDD/ADR-35 (single artifact copy; record.source is a vault path)
 * @ref SDD/Known Technical Issues (the double-copy defect this closes)
 */

import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import type { CollectionParams } from "library/baseGenerator";
import type { ViewStore } from "store/ViewStore";
import { defaultSurfaces, type ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";
import { installedChecksum } from "catalog/catalogTypes";
import type { BasesCatalogEntry, CatalogEntry, CatalogIndex, DataviewCatalogEntry } from "catalog/catalogTypes";
import { extractQueryBlocks } from "import/queryBlocks";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export type InstallResult =
	| { ok: true; path?: string }
	| { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

/** What `_findInstalled` found for an entry. */
type Lookup =
	| { state: "none" }
	| { state: "up-to-date" | "failed"; result: InstallResult }
	| { state: "stale"; id: string; record: ViewRecord };

/** What an installed file's checksums were: the whole file, or (older Dataview records) its query block. */
interface Installed {
	whole?: string | undefined;
	queryBlock?: string | undefined;
}

/** The stale Dataview record's installed checksums. */
function installedOf(record: ViewRecord): Installed {
	return record.installedSourceChecksum !== undefined
		? { whole: record.installedSourceChecksum }
		: { queryBlock: record.okayed?.checksum };
}

/** Does `content` still have the checksum it was installed with? */
async function matchesInstalled(content: string, installed: Installed): Promise<boolean> {
	if (installed.whole !== undefined) return (await computeChecksum(content)) === installed.whole;
	const blocks = extractQueryBlocks(content);
	return blocks.length === 1 && (await computeChecksum(blocks[0]!.body)) === installed.queryBlock;
}

/** A file `_materialise` wrote, with its content before (`null`: it did not exist). */
interface Written {
	path: string;
	previous: string | null;
}

// ---------------------------------------------------------------------------
// Refusal wording (mockups-catalog.html L10f, Q8)
// ---------------------------------------------------------------------------

/**
 * The machine reasons `install()` returns, by their leading text. `describeRefusal` maps each to
 * the sentence the catalog browser shows; the raw reason stays in the result (and is shown as a
 * faint second line) so a bug report still carries it.
 */
const RAW = {
	upToDate: "up-to-date",
	checksum: "checksum mismatch",
	queryChecksum: "query checksum mismatch",
	materialise: "materialise failed",
	persist: "persist failed",
	storeRead: "store read failed",
	consentDeclined: "consent declined",
} as const;

/**
 * How a refusal that already reads as a sentence begins. `_editedRefusal`, `_occupiedRefusal` and
 * `_readExisting` produce them; `describeRefusal` passes anything starting with one through as is.
 */
const REFUSED_PREFIX = { install: "Not installed", update: "Not updated" } as const;

const UP_TO_DATE: InstallResult = { ok: false, reason: `${RAW.upToDate}: already installed` };

/** What the catalog browser shows for a refused install: a sentence, and the raw reason when it was reworded. */
export interface RefusalNote {
	text: string;
	raw?: string;
	/** "neutral" for a closed DataviewJS review: not an error, nothing was written. */
	tone: "error" | "neutral";
}

/** The sentence for each reworded reason; `p` is one of `REFUSED_PREFIX`. */
function rewordRaw(reason: string, p: string, path: string, update: boolean): string {
	if (reason.startsWith(RAW.checksum) || reason.startsWith(RAW.queryChecksum)) {
		return `${p}: the bundled copy of this collection is damaged, so nothing was written. Reinstalling Story Forge restores it.`;
	}
	if (reason.startsWith(RAW.materialise)) return `${p}: could not write ${path}. Nothing was changed.`;
	if (reason.startsWith(RAW.persist)) {
		return update
			? `${p}: could not save it to the Library, so the previous file was restored.`
			: `${p}: could not save it to the Library, so the file was removed again.`;
	}
	if (reason.startsWith(RAW.storeRead)) return `${p}: could not read the Library's records. Nothing was written.`;
	if (reason.startsWith(RAW.upToDate)) return `${p}: this collection is already installed and up to date.`;
	return `${p}.`;
}

/**
 * Word a refused `install()` for the user (Q8). The three T7.2 refusals that already read well
 * ("Not updated: … was edited…", "Not installed: … already exists…", "…: could not read …") pass
 * through word for word. Every other reason gets one sentence plus its raw text. `path` is the
 * file the install was going to write; `update` picks "Not updated" over "Not installed".
 */
export function describeRefusal(reason: string, path: string, update: boolean): RefusalNote {
	const p = update ? REFUSED_PREFIX.update : REFUSED_PREFIX.install;
	if (reason.startsWith(REFUSED_PREFIX.install) || reason.startsWith(REFUSED_PREFIX.update)) return { text: reason, tone: "error" };
	if (reason === RAW.consentDeclined) {
		return { text: `${p}. You closed the review, so nothing was written.`, tone: "neutral" };
	}
	return { text: rewordRaw(reason, p, path, update), raw: reason, tone: "error" };
}

/**
 * Where a stale record's file is: its `generated.filePath`, else its `source` for a
 * `kind:"collection"` record (ADR-35: a path). A legacy `kind:"view"` Bases record keeps YAML in
 * `source`, not a path, so its update is written to `fallback` (the current folder).
 */
export function installedPath(stale: ViewRecord, fallback: string): string {
	if (stale.generated !== undefined) return stale.generated.filePath;
	return stale.kind === "collection" ? stale.source : fallback;
}

/** An updated record keeps what the user chose on the record it replaces. */
function keepUserChoices(fresh: ViewRecord, stale: ViewRecord): ViewRecord {
	return {
		...fresh,
		enabled: stale.enabled,
		surfaces: { ...stale.surfaces },
		command: stale.command,
		...(stale.commandName !== undefined ? { commandName: stale.commandName } : {}),
		...(stale.commandLabel !== undefined ? { commandLabel: stale.commandLabel } : {}),
	};
}

export interface CatalogServiceDeps {
	app: App;
	gate: ConsentGate;
	store: ViewStore;
	/** Vault folder where curated .base files are materialised. Default "00 Meta/Bases". */
	curatedBasesFolder: string;
	/**
	 * The params a freshly-installed collection is recorded as rendered with
	 * (ADR-0003 `generated.params`). NOT read from settings here — `excludedFolders`
	 * does not exist on `PluginSettings` yet (T3.5 adds it); the construction site
	 * injects a placeholder until then. CatalogService does not call `renderBase`
	 * with these — it only stores them for `classify()` to compare against later.
	 */
	collectionParams: CollectionParams;
}

// ---------------------------------------------------------------------------
// CatalogService
// ---------------------------------------------------------------------------

/**
 * Stateless service for browsing and installing curated catalog entries.
 *
 * The index is injected at construction time (from the bundled asset or a test
 * fixture) — never fetched from the network and never read from dist/ at runtime.
 */
export class CatalogService {
	private readonly index: CatalogIndex;
	private readonly deps: CatalogServiceDeps;

	constructor(index: CatalogIndex, deps: CatalogServiceDeps) {
		this.index = index;
		this.deps = deps;
	}

	/** Return all entries from the injected index. */
	getEntries(): CatalogEntry[] {
		return this.index.entries;
	}

	/**
	 * Where a fresh install of `entry` writes: `<Folder for collections from the repo>/<id>.base`
	 * for a Bases entry, `<id>.md` for a Dataview note. The catalog browser shows it as "Installs to".
	 */
	targetPath(entry: CatalogEntry): string {
		return this._targetPath(entry, entry.engine === "bases" ? "base" : "md");
	}

	/**
	 * Install a catalog entry by id.
	 *
	 * Follows the curated-install algorithm (SDD Runtime View):
	 * VERIFY → MATERIALISE → PERSIST.
	 *
	 * Never throws — always returns InstallResult. If PERSIST fails after
	 * MATERIALISE, the write is undone to avoid partial state.
	 */
	async install(id: string): Promise<InstallResult> {
		const entry = this.index.entries.find((e) => e.id === id);
		if (!entry) {
			return { ok: false, reason: `not-found: no catalog entry with id "${id}"` };
		}

		switch (entry.engine) {
			case "bases":
				return this._installBasesEntry(entry);
			case "dataview-dql":
			case "dataviewjs":
				return this._installDataviewEntry(entry);
			default: {
				// Exhaustive guard: a future CatalogEntry variant must be handled here
				// before it reaches production. This will fail to compile until done.
				const _exhaustive: never = entry;
				return { ok: false, reason: `unsupported engine: ${String(_exhaustive)}` };
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Private — bases install path
	// ---------------------------------------------------------------------------

	/**
	 * Install a bases entry atomically:
	 *   duplicate/stale check → (update: edited-file refusal) → materialise → persist.
	 *
	 * Atomic guarantee: if store.setRecord throws after the .base file was written,
	 * the write is undone (best-effort): a new file is removed, a replaced one gets
	 * its previous content back.
	 *
	 * Duplicate detection matches on rec.catalogId === entry.id — the stable slug,
	 * mirroring BrowseOfficialModal's own installed-record lookup (which pairs the
	 * same catalogId match with an okayed.checksum comparison to tell "up to date"
	 * apart from "update available" — F7). The paired checksum comparison is what
	 * keeps BrowseOfficialModal's "Update" affordance working: it also calls
	 * install() on the same entry.id, and a stale record (okayed.checksum !==
	 * entry.checksum) is updated in place under its own id (T7.2) rather than
	 * being reported as an already-installed duplicate. Records persisted before
	 * catalogId existed (pre-T4.5) have none; for those we fall back to the
	 * legacy source === source comparison.
	 */
	private async _installBasesEntry(entry: BasesCatalogEntry): Promise<InstallResult> {
		// 1. VERIFY checksum before any side effect.
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return {
				ok: false,
				reason: `${RAW.checksum}: expected ${entry.checksum}, got ${computed}`,
			};
		}

		// 2. Duplicate / stale check (see the method docstring and `_findInstalled`).
		const found = await this._findInstalled(entry);
		if (found.state === "up-to-date" || found.state === "failed") return found.result;
		const stale = found.state === "stale" ? found : null;
		const path = stale ? installedPath(stale.record, this._targetPath(entry, "base")) : this._targetPath(entry, "base");
		const refusal = stale
			? await this._editedRefusal(path, { whole: stale.record.generated?.instanceChecksum ?? stale.record.okayed?.checksum })
			: await this._occupiedRefusal(path, entry);
		if (refusal !== null) return refusal;

		// 3. MATERIALISE: write the .base YAML file into the vault folder.
		let written: Written;
		try {
			written = await this._materialise(entry, path);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `${RAW.materialise}: ${msg}` };
		}
		const writtenPath = written.path;

		// 4. PERSIST: write ViewRecord (ADR-35 shape). On failure, undo the write
		// (remove a new file, restore a replaced one).
		//
		// instanceChecksum is the checksum of the bytes actually written to
		// writtenPath — NOT a re-read or re-serialisation. _materialise writes
		// entry.source verbatim, and `computed` (from VERIFY, above) is already
		// computeChecksum(entry.source) — the same bytes — so it doubles as the
		// checksum of what landed on disk.
		const instanceChecksum = computed;
		const record: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: computed },
			// ADR-35: source is the vault PATH, not the YAML — the vault file is
			// the single copy (closes the double-copy defect).
			source: writtenPath,
			engine: "bases",
			command: false,
			commandName: entry.name,
			kind: "collection",
			surfaces: defaultSurfaces("bases"),
			// catalogId is the stable entry slug — never changes for an existing entry,
			// survives catalog renames. Used by BrowseOfficialModal for update detection.
			catalogId: entry.id,
			generated: {
				// The catalog entry's own checksum — honest until T7.3 wires a real
				// template producer; the `reconsent` classify() branch stays inert
				// until then (see class docstring).
				sourceChecksum: entry.checksum,
				params: {
					tag: this.deps.collectionParams.tag,
					excludedFolders: [...this.deps.collectionParams.excludedFolders],
				},
				instanceChecksum,
				filePath: writtenPath,
				verify: true,
			},
			...(entry.description !== undefined ? { description: entry.description } : {}),
		};

		return this._persist(stale, record, written);
	}

	// ---------------------------------------------------------------------------
	// Private — Dataview install path (T7.2)
	// ---------------------------------------------------------------------------

	/**
	 * Install a curated Dataview note: verify → duplicate-check → (DataviewJS: consent) →
	 * materialise `<folder>/<id>.md` → persist. The note lands in the same folder as a `.base`
	 * ("Folder for collections from the repo", P14). The record carries no `generated` block:
	 * the note is copied verbatim and is not a template (ADR-0003 covers `.base` templates).
	 *
	 * `okayed` is what ConsentGate computes from the written note (block checksum, sf-version),
	 * so a DQL entry draws with no modal (PRD F7 AC 8) and an edited note reads as drift like any
	 * other Dataview collection. DataviewJS asks BEFORE anything is written; a decline writes
	 * nothing.
	 */
	private async _installDataviewEntry(entry: DataviewCatalogEntry): Promise<InstallResult> {
		const mismatch = await this._verifyDataview(entry);
		if (mismatch !== null) return { ok: false, reason: mismatch };
		const found = await this._findInstalled(entry);
		if (found.state === "up-to-date" || found.state === "failed") return found.result;
		const stale = found.state === "stale" ? found : null;
		const path = stale ? installedPath(stale.record, this._targetPath(entry, "md")) : this._targetPath(entry, "md");
		const refusal = stale
			? await this._editedRefusal(path, installedOf(stale.record))
			: await this._occupiedRefusal(path, entry);
		if (refusal !== null) return refusal;

		const okayed = await this._dataviewApproval(entry, path);
		if (okayed === null) return { ok: false, reason: RAW.consentDeclined };

		let written: Written;
		try {
			written = await this._materialise(entry, path);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `${RAW.materialise}: ${msg}` };
		}
		return this._persist(stale, this._dataviewRecord(entry, path, okayed), written);
	}

	/** Fail closed: the note's bytes and its one query block must match what the catalog recorded. */
	private async _verifyDataview(entry: DataviewCatalogEntry): Promise<string | null> {
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return `${RAW.checksum}: expected ${entry.checksum}, got ${computed}`;
		}
		const blocks = extractQueryBlocks(entry.source);
		const query = blocks.length === 1 ? await computeChecksum(blocks[0]!.body) : null;
		if (query !== entry.queryChecksum) {
			return `${RAW.queryChecksum}: expected ${entry.queryChecksum}, got ${query ?? "no single query block"}`;
		}
		return null;
	}

	/** DQL: approved by provenance. DataviewJS: the full consent modal, before any write. */
	private async _dataviewApproval(entry: DataviewCatalogEntry, path: string): Promise<{ version: number; checksum: string } | null> {
		if (entry.engine === "dataview-dql") return { version: entry.version, checksum: entry.queryChecksum };
		// Safe: _verifyDataview (run first) refused any source without exactly one query block.
		const query = extractQueryBlocks(entry.source)[0]!;
		return this.deps.gate.requestConsentForQuery({
			engine: entry.engine,
			name: entry.name,
			...(entry.description !== undefined ? { description: entry.description } : {}),
			body: query.body,
			version: entry.version,
			sourcePath: path,
		});
	}

	private _dataviewRecord(entry: DataviewCatalogEntry, path: string, okayed: { version: number; checksum: string }): ViewRecord {
		return {
			provenance: "curated",
			enabled: true,
			okayed,
			source: path,
			engine: entry.engine,
			command: false,
			commandName: entry.name,
			kind: "collection",
			surfaces: defaultSurfaces(entry.engine),
			catalogId: entry.id,
			installedSourceChecksum: entry.checksum,
			...(entry.description !== undefined ? { description: entry.description } : {}),
		};
	}

	// ---------------------------------------------------------------------------
	// Private — shared by both paths
	// ---------------------------------------------------------------------------

	/**
	 * Is `entry` installed? "up-to-date" when a record of it holds its current checksum
	 * (`installedChecksum`); "stale" (with that record's id) when a record of it holds an older
	 * one, so Update replaces that record in place; "none" otherwise. Match by catalogId when the
	 * record has one; fall back to source equality only for pre-T4.5 records that predate it.
	 */
	private async _findInstalled(entry: CatalogEntry): Promise<Lookup> {
		let existing: Record<string, ViewRecord>;
		try {
			existing = await this.deps.store.getViews();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { state: "failed", result: { ok: false, reason: `${RAW.storeRead}: ${msg}` } };
		}
		const current = installedChecksum(entry);
		for (const [id, rec] of Object.entries(existing)) {
			if (rec.catalogId === undefined) {
				if (rec.source === entry.source) return { state: "up-to-date", result: UP_TO_DATE };
				continue;
			}
			if (rec.catalogId !== entry.id) continue;
			if (rec.okayed?.checksum === current) return { state: "up-to-date", result: UP_TO_DATE };
			return { state: "stale", id, record: rec };
		}
		return { state: "none" };
	}

	/**
	 * Refuse an Update that would overwrite the user's edits: the file at `path` no longer has the
	 * checksum the stale record installed. `installed.whole` is the whole file's checksum; when a
	 * (pre-`installedSourceChecksum`) Dataview record has none, `installed.queryBlock` is compared
	 * with the note's query block instead. A missing file has nothing to lose, and the update
	 * proceeds. An unreadable file fails closed.
	 */
	private async _editedRefusal(path: string, installed: Installed): Promise<InstallResult | null> {
		const read = await this._readExisting(path, REFUSED_PREFIX.update);
		if (typeof read !== "string") return read;
		if (await matchesInstalled(read, installed)) return null;
		return { ok: false, reason: `${REFUSED_PREFIX.update}: ${path} was edited after it was installed, and updating would overwrite those edits.` };
	}

	/**
	 * Refuse a fresh install onto a file the catalog did not write (no record of it): it would be
	 * overwritten. A file with exactly the entry's bytes is the same install with a lost record,
	 * and is adopted. Checked before any consent modal.
	 */
	private async _occupiedRefusal(path: string, entry: CatalogEntry): Promise<InstallResult | null> {
		const read = await this._readExisting(path, REFUSED_PREFIX.install);
		if (typeof read !== "string") return read;
		if ((await computeChecksum(read)) === entry.checksum) return null;
		return { ok: false, reason: `${REFUSED_PREFIX.install}: ${path} already exists. Move, rename or remove it, then install again.` };
	}

	/** The file's content; `null` when it does not exist; a refusal (`prefix`) when it cannot be read. */
	private async _readExisting(path: string, prefix: string): Promise<string | InstallResult | null> {
		const adapter = this.deps.app.vault.adapter;
		try {
			return (await adapter.exists(path)) ? await adapter.read(path) : null;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `${prefix}: could not read ${path}: ${msg}` };
		}
	}

	/**
	 * Write `record` — under the stale record's id, keeping what the user set on it (enabled, the
	 * two surfaces, the command), or under a new id. On failure undo the file write: a file that
	 * did not exist is removed, one that did gets its previous content back.
	 */
	private async _persist(stale: { id: string; record: ViewRecord } | null, record: ViewRecord, written: Written): Promise<InstallResult> {
		const id = stale?.id ?? crypto.randomUUID();
		const merged = stale ? keepUserChoices(record, stale.record) : record;
		try {
			await this.deps.store.setRecord(id, merged);
		} catch (err) {
			await this._undoWrite(written);
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `${RAW.persist}: ${msg}` };
		}
		return { ok: true, path: written.path };
	}

	/** Best-effort rollback of `_materialise`; a failure is logged, never masks the original error. */
	private async _undoWrite(written: Written): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		try {
			if (written.previous === null) await adapter.remove(written.path);
			else await adapter.write(written.path, written.previous);
		} catch {
			console.debug("[StoryForge] CatalogService: rollback failed", written.path);
		}
	}

	// ---------------------------------------------------------------------------
	// Private — vault materialise helper
	// ---------------------------------------------------------------------------

	/**
	 * Write an entry (`.base` or, T7.2, a Dataview `.md`) to `filePath`, remembering what was
	 * there before so `_persist` can undo the write.
	 *
	 * Creates the folder via vault.adapter.mkdir when absent. mkdir is a properly
	 * typed method on the DataAdapter interface (obsidian.d.ts:2099) — no `as
	 * unknown` cast needed; no fictional-method risk.
	 *
	 * Throws on any vault error — the callers (_installBasesEntry, _installDataviewEntry) catch and
	 * return { ok:false }.
	 */
	private async _materialise(entry: CatalogEntry, filePath: string): Promise<Written> {
		const adapter = this.deps.app.vault.adapter;
		const folderPath = normalizePath(this.deps.curatedBasesFolder);
		if (!(await adapter.exists(folderPath))) {
			await adapter.mkdir(folderPath);
		}
		const previous = (await adapter.exists(filePath)) ? await adapter.read(filePath) : null;
		await adapter.write(filePath, entry.source);
		return { path: filePath, previous };
	}

	/** Where `entry` is written: `<curatedBasesFolder>/<id>.<extension>`. */
	private _targetPath(entry: CatalogEntry, extension: "base" | "md"): string {
		return normalizePath(`${this.deps.curatedBasesFolder}/${entry.id}.${extension}`);
	}
}
