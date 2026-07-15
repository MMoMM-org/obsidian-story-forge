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
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";

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

		// 2. Platform-restricted — Dataview itself blocks DataviewJS execution on
		//    mobile, so DataviewJS views cannot render there. (The checksum is
		//    cross-platform via Web Crypto, so it is NOT the restriction reason.)
		if (record.engine === "dataviewjs" && Platform.isMobile) {
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

		// 5. Not consented — okayed is null (never consented)
		if (!record.okayed) {
			return { status: "not-consented" };
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

	// ---------------------------------------------------------------------------
	// Modal dispatch (shared by requestConsent and requestReConsent)
	// ---------------------------------------------------------------------------

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
		const variant =
			record.engine === "dataviewjs" ? "dataviewjs-full" : "dql-light";

		// Read the fenced block fresh to populate the modal and compute checksum.
		// If the source is missing, we cannot show the modal — fail-closed.
		const block = await readFencedBlock(this.app, record.source);
		if (block === null) {
			return false;
		}

		const checksum = await computeChecksum(block.body);
		const version = this._readVersion(record.source);

		const modal = new DisclosureModal(this.app, variant, {
			name: record.commandName ?? record.source,
			description: record.description,
			sourcePath: record.source,
			source: block.body,
			checksum,
			isDrift,
		});

		const granted = await modal.present();

		if (granted) {
			// Single setRecord call with okayed+enabled:true (ADR-4/ADR-5)
			await this.store.setRecord(id, {
				...record,
				enabled: true,
				okayed: { version, checksum },
			});
		}
		// On Cancel: no write, no state mutation

		return granted;
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

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
