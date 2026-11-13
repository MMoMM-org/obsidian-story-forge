/**
 * ConsentGate — evaluates consent state and drives the consent/re-consent modals.
 *
 * Injected into SidebarView (in-panel flows) and SettingsTab (view-list rows).
 * Constructed in main.ts with EngineRegistry, DvSettingsReader, ViewStore, App.
 *
 * @ref SDD/Interface Specifications — Consent types + ConsentGate
 * @ref SDD/ADR-4 (byte-exact checksum, fresh read on every evaluate)
 * @ref SDD/ADR-5 (consent policy, drift on version-OR-checksum, fail-closed)
 * @ref SDD/Implementation Examples — Consent drift detection
 */

import { Platform, TFile } from "obsidian";
import type { App } from "obsidian";
import { readFencedBlock } from "import/fencedBlock";
import { computeChecksum } from "consent/checksum";
import { DisclosureModal } from "consent/DisclosureModal";
import { classify } from "library/baseGenerator";
import type { CollectionParams } from "library/baseGenerator";
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";
import type { ViewDefinition } from "import/ViewDefinition";

// ---------------------------------------------------------------------------
// ConsentDecision union
// ---------------------------------------------------------------------------

/** Result of a consent-gate evaluation for a single ViewRecord. */
export type ConsentDecision =
	| { status: "consented" }             // okayed and current — render is permitted
	| { status: "not-consented" }         // okayed is null OR source note missing
	| { status: "drift"; reason: "version" | "checksum" | "both" } // okayed is stale
	| { status: "disabled" }              // enabled:false regardless of okayed
	| { status: "platform-restricted" }   // DataviewJS on mobile
	| { status: "engine-missing" }        // Dataview plugin absent or version < 0.5.31
	| { status: "dvjs-off" };             // enableDataviewJs:false in Dataview settings

// ---------------------------------------------------------------------------
// Injectable interfaces (minimal — for unit-testability without real Dataview)
// ---------------------------------------------------------------------------

/**
 * Minimal slice of EngineRegistry used by ConsentGate.
 * The real EngineRegistry satisfies this interface.
 */
/** What the disclosure modal shows for a query, with the version its tokens carry. */
export interface ConsentQuery {
	engine: ViewRecord["engine"];
	name: string;
	description?: string;
	/** The query block's body — what is shown and checksummed. */
	body: string;
	version: number;
}

export interface EngineRegistryLike {
	get(kind: ViewRecord["engine"]): unknown;
}

/**
 * Reads whether DataviewJS is enabled in Dataview's settings.
 * Injected so ConsentGate does not directly depend on the Dataview API.
 */
export interface DvSettingsReader {
	isDvJsEnabled(): boolean;
}

/**
 * Reads the CURRENT upstream/template checksum for a generated collection
 * record (T3.4 / ADR-0003). Since T7.3 only pre-T7.3 records reach it, and
 * main.ts always answers null. A seam: `ConsentGate` must not import the
 * catalog, so the caller (main.ts) supplies whatever knows how to look this
 * up. Returns null when the upstream cannot be determined — e.g. the entry
 * is no longer in the catalog — which `_evaluateGeneratedCollection` treats
 * as "cannot tell, do not nag" rather than as drift.
 */
export type GetCurrentSourceChecksum = (
	record: ViewRecord,
) => Promise<string | null>;

/**
 * Reads the params (tag, excluded folders) a generated collection would be
 * rendered with (T3.4 / ADR-0003). Injected so `ConsentGate` does not read
 * `PluginSettings` directly. Since T7.3 main.ts passes the empty params
 * pre-T7.3 records were installed with (`legacyGeneratedParams`).
 */
export type GetCurrentParams = () => CollectionParams;

// ---------------------------------------------------------------------------
// ConsentGate class
// ---------------------------------------------------------------------------

/**
 * ConsentGate implements consent evaluation + modal dispatch.
 *
 * At T1.3, requestConsent and requestReConsent are stubs (return false).
 * They are completed in T1.4 (DisclosureModal).
 */
export class ConsentGate {
	constructor(
		private readonly app: App,
		private readonly registry: EngineRegistryLike,
		private readonly dvSettings: DvSettingsReader,
		private readonly store: ViewStore,
		// Required (T3.4): only consulted from the record.generated branch
		// below, which serves records installed before T7.3 alone — a curated
		// install no longer writes `generated` (T7.3, reduced). main.ts passes
		// `async () => null` and `() => legacyGeneratedParams` (empty params),
		// the values those records were installed with; nothing regenerates.
		private readonly getCurrentSourceChecksum: GetCurrentSourceChecksum,
		private readonly getCurrentParams: GetCurrentParams,
	) {}

	/**
	 * Evaluate the current consent state for a view.
	 *
	 * Decision order (exact per SDD/T1.3):
	 *   disabled → platform-restricted → engine-missing → dvjs-off →
	 *   not-consented (null okayed OR missing source) → drift → consented
	 *
	 * Reads the fenced block FRESH from record.source on every call.
	 * Fail-closed: any unknown/error case resolves to not-consented or engine-missing.
	 */
	async evaluate(record: ViewRecord): Promise<ConsentDecision> {
		// 1. Disabled (kill-switch)
		if (!record.enabled) {
			return { status: "disabled" };
		}

		// 2. Platform-restricted — DataviewJS cannot execute on mobile (Dataview
		//    blocks it); Bases surfaces are desktop-only per ADR-10 Phase 0 verdict.
		//    (The checksum is cross-platform via Web Crypto — NOT the reason.)
		const isMobileRestricted =
			record.engine === "dataviewjs" || record.engine === "bases";
		if (isMobileRestricted && Platform.isMobile) {
			return { status: "platform-restricted" };
		}

		// 3. Engine-missing — Dataview not installed or version too low
		const engine = this.registry.get(record.engine);
		if (engine === undefined) {
			return { status: "engine-missing" };
		}

		// 4. DataviewJS off — enableDataviewJs:false in Dataview settings
		if (record.engine === "dataviewjs" && !this.dvSettings.isDvJsEnabled()) {
			return { status: "dvjs-off" };
		}

		// 4b. A .base collection with no `generated` block (imported, T7.2, or from repo, T7.3): enable/disable only
		//     (PRD F7 AC 8). The file is read on every render and is the user's to edit in Bases
		//     (L3b, ADR-34), so an edit is not drift and there is no consent to ask for.
		if (isUserBaseCollection(record)) {
			return { status: "consented" };
		}

		// 5. Not consented — okayed is null (never consented)
		if (!record.okayed) {
			return { status: "not-consented" };
		}

		// 5a. Generated collection (ADR-29/ADR-35/ADR-0003, T3.4): a catalog-
		//     rendered collection carries verified generation metadata in
		//     `record.generated` instead of raw .base YAML in `record.source` —
		//     `source` is a vault PATH to the materialised .base file. Checksumming
		//     that path as if it were YAML can never equal okayed.checksum and
		//     would always report drift. classify() (src/library/baseGenerator.ts)
		//     does the real three-way comparison (source checksum / params /
		//     instance checksum); this gate only decides whether the result may
		//     RENDER.
		if (record.generated !== undefined) {
			return this._evaluateGeneratedCollection(record, record.generated);
		}

		// 6a. Bases source-model seam (ADR-5 / ADR-6): a bases record stores its
		//     raw .base YAML directly in record.source — there is no vault file to
		//     read and no fenced block to parse. Declarative (.base) → no modal;
		//     checksum guards drift; empty source → fail-closed (not-consented).
		//     A kind:"collection" record is the exception: its source is the PATH of the
		//     .base file (ADR-35), so `_basesYaml` reads the file and the gate judges that.
		if (record.engine === "bases") {
			return this._evaluateBasesRecord(await this._basesYaml(record), record.okayed);
		}

		// 6. Not consented — source note missing from vault (returns null → not-consented)
		const block = await readFencedBlock(this.app, record.source);
		if (block === null) {
			return { status: "not-consented" };
		}

		// 7. Drift — version OR checksum changed independently triggers re-consent (ADR-5)
		const currentChecksum = await computeChecksum(block.body);
		const currentVersion = this._readVersion(record.source);
		const versionDrifted = record.okayed.version !== currentVersion;
		const checksumDrifted = record.okayed.checksum !== currentChecksum;

		if (versionDrifted || checksumDrifted) {
			return {
				status: "drift",
				reason:
					versionDrifted && checksumDrifted
						? "both"
						: versionDrifted
							? "version"
							: "checksum",
			};
		}

		// 8. Consented — all checks passed
		return { status: "consented" };
	}

	/**
	 * Open the full DataviewJS disclosure modal (S20) or DQL light confirm (S21).
	 * On "Enable": reads fenced block fresh, computes checksum, writes
	 * okayed:{version,checksum}+enabled:true via store.setRecord() in ONE call.
	 * On Cancel/Escape: no write.
	 *
	 * @returns true if the user granted consent; false if dismissed.
	 */
	async requestConsent(id: string, record: ViewRecord): Promise<boolean> {
		return this._openModal(id, record, false);
	}

	/**
	 * Open the re-consent modal (S23 for DataviewJS; same light-confirm for DQL).
	 * Triggered when evaluate() returns { status: "drift" }.
	 * Same write semantics as requestConsent.
	 *
	 * @returns true if the user re-granted consent; false if dismissed.
	 */
	async requestReConsent(id: string, record: ViewRecord): Promise<boolean> {
		return this._openModal(id, record, true);
	}

	/**
	 * Evaluate consent on an in-memory ViewDefinition WITHOUT writing the store.
	 *
	 * Used by the import flow to consent-gate a parsed definition before a
	 * ViewRecord (and its store id) exists. Presents the same disclosure modal
	 * as the store-writing path; returns the consent tokens on grant so the
	 * caller can persist them when it writes the record, or null on
	 * cancel/dismiss or missing source (fail-closed).
	 */
	async requestConsentForDef(
		def: ViewDefinition,
		isDrift = false,
	): Promise<{ version: number; checksum: string } | null> {
		return this._presentConsentModal(
			{
				source: def.sourcePath,
				engine: def.engine,
				name: def.name,
				description: def.description,
			},
			isDrift,
		);
	}

	// ---------------------------------------------------------------------------
	// Modal dispatch (shared by requestConsent and requestReConsent)
	// ---------------------------------------------------------------------------

	/**
	 * Consent for a query that is not in the vault yet (T7.2: a curated DataviewJS entry, asked
	 * BEFORE its note is written, so a decline leaves nothing behind). Same modal and tokens as
	 * `requestConsentForDef`; the body and version come from the caller instead of a vault read.
	 * Never writes the store.
	 */
	async requestConsentForQuery(
		query: ConsentQuery & { sourcePath: string },
	): Promise<{ version: number; checksum: string } | null> {
		const { sourcePath, ...rest } = query;
		return this._presentDisclosure({ ...rest, source: sourcePath }, false);
	}

	/**
	 * Open the appropriate modal variant, await the user's decision, and if
	 * "Enable" was clicked: read the fenced block fresh, compute its checksum,
	 * and write okayed+enabled to the store in a single setRecord call (ADR-4).
	 */
	private async _openModal(
		id: string,
		record: ViewRecord,
		isDrift: boolean,
	): Promise<boolean> {
		const tokens = await this._presentConsentModal(
			{
				source: record.source,
				engine: record.engine,
				name: record.commandName ?? record.source,
				description: record.description,
			},
			isDrift,
		);

		if (tokens === null) {
			// On Cancel / missing source: no write, no state mutation
			return false;
		}

		// Single setRecord call with okayed+enabled:true (ADR-4/ADR-5)
		await this.store.setRecord(id, {
			...record,
			enabled: true,
			okayed: tokens,
		});
		return true;
	}

	/**
	 * Modal-presentation core shared by the store-writing consent paths and the
	 * store-less import path (requestConsentForDef).
	 *
	 * Reads the fenced block fresh from `fields.source`; if it is missing, fails
	 * closed (returns null — the modal is never shown). Otherwise computes the
	 * checksum and version, presents the DisclosureModal, and returns the consent
	 * tokens on grant or null on cancel/dismiss. Never writes the store.
	 */
	private async _presentConsentModal(
		fields: {
			source: string;
			engine: ViewRecord["engine"];
			name: string;
			description?: string;
		},
		isDrift: boolean,
	): Promise<{ version: number; checksum: string } | null> {
		// Read the fenced block fresh to populate the modal and compute checksum.
		// If the source is missing, we cannot show the modal — fail-closed.
		const block = await readFencedBlock(this.app, fields.source);
		if (block === null) {
			return null;
		}
		const version = this._readVersion(fields.source);
		return this._presentDisclosure({ ...fields, body: block.body, version }, isDrift);
	}

	/** Show the DisclosureModal for `query`; the tokens on grant, null on cancel. Never writes. */
	private async _presentDisclosure(
		query: ConsentQuery & { source: string },
		isDrift: boolean,
	): Promise<{ version: number; checksum: string } | null> {
		const variant = query.engine === "dataviewjs" ? "dataviewjs-full" : "dql-light";
		const checksum = await computeChecksum(query.body);
		const modal = new DisclosureModal(this.app, variant, {
			name: query.name,
			description: query.description,
			sourcePath: query.source,
			source: query.body,
			checksum,
			isDrift,
		});
		const granted = await modal.present();
		return granted ? { version: query.version, checksum } : null;
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * The `.base` YAML a bases record is judged on. A `kind:"collection"` record stores the vault
	 * PATH of its file (ADR-35), so the file's contents are read, with `cachedRead`, the same read
	 * `BasesFenceEngine` renders from: what is checksummed is what runs. `null`: the file is gone.
	 */
	private async _basesYaml(record: ViewRecord): Promise<string | null> {
		if (record.kind !== "collection") return record.source;
		const file = this.app.vault.getFileByPath(record.source);
		return file ? this.app.vault.cachedRead(file) : null;
	}

	/**
	 * Evaluate consent for a `bases` record. The source is raw .base YAML stored
	 * directly on the record — no vault file, no fenced block (ADR-5).
	 *
	 * Declarative → no modal (ADR-6). Fail-closed: empty source → not-consented.
	 * Drift is checksum-only (no sf-version for bases).
	 */
	private async _evaluateBasesRecord(
		yamlSource: string | null,
		okayed: { version: number; checksum: string },
	): Promise<ConsentDecision> {
		// No file to judge: let the engine report it ("Collection file not found: <path>").
		if (yamlSource === null) return { status: "consented" };
		if (!yamlSource) {
			return { status: "not-consented" };
		}
		const currentChecksum = await computeChecksum(yamlSource);
		// okayed.version is intentionally ignored for bases records: ADR-5 stores no
		// sf-version in .base YAML — checksum is the sole drift signal.
		if (okayed.checksum !== currentChecksum) {
			return { status: "drift", reason: "checksum" };
		}
		return { status: "consented" };
	}

	/**
	 * Evaluate consent for a generated collection record (ADR-0003, T3.4).
	 *
	 * `classify()` runs the real three-way comparison (source checksum / params
	 * / instance checksum on disk) and returns one of `clean | regenerate | ask
	 * | reconsent`. `ConsentDecision` has no `ask`/`regenerate` member by
	 * design — the gate decides whether a view may RENDER, not whether a file
	 * may be overwritten:
	 *
	 *   - `clean`      → consented (nothing changed).
	 *   - `regenerate` → consented, WITHOUT a prompt. This is the SDD Edge
	 *                    Case ("params changed ⇒ regenerate without
	 *                    prompting") — the gate never manufactures a modal for
	 *                    the plugin's own settings changes. Regenerating the
	 *                    file is a caller's job, not this gate's.
	 *   - `ask`        → consented. ADR-0003's "ask the user; offer
	 *                    regenerate" is a regeneration-path concern, not a
	 *                    render-gate concern: mapping `ask` to consented
	 *                    renders the user's hand-edited file as-is and never
	 *                    overwrites it — the safe direction. The signed-off
	 *                    mockup (docs/mockups/anvil-workbench-codex.html:
	 *                    1152-1161) describes the ask/regenerate distinction
	 *                    in prose but draws NO UI state for that prompt;
	 *                    inventing a modal here would breach the repo's
	 *                    mockups-are-a-gate rule. That modal belongs to a
	 *                    later phase (Phase 7) — do not "fix" this mapping
	 *                    without a signed-off mockup for it.
	 *   - `reconsent`  → drift (checksum). The upstream template changed —
	 *                    routes through the existing re-consent flow.
	 *
	 * Since T7.3 (reduced) this branch serves only records installed before T7.3,
	 * and with main.ts's seams (`async () => null`, `legacyGeneratedParams`) the
	 * `reconsent` and `regenerate` outcomes are inert in production: they are
	 * reachable only from unit tests over synthetic inputs.
	 *
	 * `getCurrentSourceChecksum` returning null means the upstream is unknown
	 * (e.g. the entry is no longer in the catalog) — treated as "cannot tell,
	 * do not nag" by falling back to the record's own stored sourceChecksum,
	 * which classify() then reads as unchanged and lets the remaining
	 * (params/instance) inputs decide.
	 */
	private async _evaluateGeneratedCollection(
		record: ViewRecord,
		generated: NonNullable<ViewRecord["generated"]>,
	): Promise<ConsentDecision> {
		// Null upstream ?? falls back to the record's OWN stored checksum, i.e.
		// compares it to itself — deliberately reads as "unchanged" ("cannot
		// tell, do not nag"), not a copy-paste self-comparison bug.
		const currentSourceChecksum =
			(await this.getCurrentSourceChecksum(record)) ?? generated.sourceChecksum;
		const fileChecksum = await this._readGeneratedFileChecksum(generated.filePath);

		const state = classify(
			generated,
			currentSourceChecksum,
			this.getCurrentParams(),
			fileChecksum,
		);

		if (state === "reconsent") {
			return { status: "drift", reason: "checksum" };
		}
		// clean | regenerate | ask all render as-is (see docstring above).
		return { status: "consented" };
	}

	/**
	 * Read the byte-exact checksum of the file currently at `filePath`, or
	 * null when it is missing/unreadable. `classify()` treats null the same
	 * as "a change we caused" (regenerate), never as a foreign edit (ADR-35 —
	 * one file read per evaluate is accepted cost, not a regression).
	 *
	 * `Vault.read()` can reject (I/O error, binary decode failure, a race
	 * after the existence check above) — caught here so one unreadable file
	 * degrades to null instead of throwing out of `evaluate()` and aborting
	 * every other row a caller (e.g. SettingsTab's `Promise.all`) is rendering.
	 */
	private async _readGeneratedFileChecksum(filePath: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return null;
		try {
			const content = await this.app.vault.read(file);
			return await computeChecksum(content);
		} catch (err) {
			console.error("[StoryForge] failed to read generated file for consent evaluation", filePath, err);
			return null;
		}
	}

	/**
	 * Read the current sf-version from the note's cached metadata.
	 * Returns 0 when the frontmatter is absent or sf-version is not a number.
	 * Fail-closed: any malformed value → 0 (triggers drift if okayed.version ≠ 0).
	 */
	private _readVersion(sourcePath: string): number {
		// Look up file from vault to pass to metadataCache.getFileCache
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return 0;
		const cache = this.app.metadataCache.getFileCache(file);
		// FrontMatterCache uses [key: string]: any — narrow to unknown for safe check
		const sfVersion: unknown = cache?.frontmatter?.["sf-version"];
		return typeof sfVersion === "number" ? sfVersion : 0;
	}
}

/**
 * A `.base` collection the gate does not police: Bases, `kind:"collection"`, no `generated`
 * block — an imported `.base` (T7.2) and, since T7.3, a curated one installed from the repo
 * (installed verbatim, no `generated`). Both are enable/disable only (PRD F7 AC 8). Records
 * installed before T7.3 keep `generated` and take `_evaluateGeneratedCollection` instead.
 * A malformed `generated` block degrades to absent (store/types), so a broken from-repo record also
 * lands here; low risk, because Bases runs no code — the exemption is engine-gated, never DataviewJS.
 */
function isUserBaseCollection(record: ViewRecord): boolean {
	return record.engine === "bases" && record.kind === "collection" && record.generated === undefined;
}
