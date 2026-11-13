/**
 * runImportFlow — consent-then-commit import (T-S2.4, F2).
 * installCurated — gate-less 1-click install for curated catalog entries (T4.3).
 *
 * runImportFlow: pick → (DataviewJS only: one consent gate) → commit, and report the outcome to the
 * import modal, which shows it inline (L11, R1/R4/R6). A `.base` (T7.2) and a Dataview (DQL) note
 * (L11 R1) skip the gate. The bind step was removed
 * (F2): clicking outside the (former) bind modal restarted the whole flow, and
 * the sibling markdown-mason plugin has no bind step either. Command binding is
 * now a separate Settings action (Edit), not part of the import flow.
 *
 * installCurated: catalog-install flow per ADR-6. Declarative engines (.base /
 * DQL) are trusted by provenance and install 1-click (no consent modal). DataviewJS
 * entries still gate through requestConsentForDef; a declined consent commits
 * nothing. Both paths write provenance:"curated".
 *
 * @ref SDD/Runtime View — Flow C (import → consent → commit)
 * @ref SDD/ADR-4/ADR-5 (consent tokens), ADR-6 (curated gate-less), ADR-9 (store id)
 * @ref PRD/AC-F3.4, AC-F3.6, AC-F3.7, AC-F4.3, AC-F4.4
 */

import { Notice } from "obsidian";
import type { App } from "obsidian";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import type { ConsentGate } from "consent/ConsentGate";

/**
 * Declarative engine kinds that do not require a consent modal on install.
 * T7.2: "bases" joined when ViewDefinition["engine"] gained it.
 */
const DECLARATIVE_ENGINES = new Set<ViewDefinition["engine"]>(["bases", "dataview-dql"]);

/**
 * The consent tokens a vault import is committed with. Declarative engines get no dialog (PRD F7
 * AC 8: Bases and DQL are enable/disable only):
 * - a `.base`: the tokens record the bytes that were imported, and the gate does not re-check
 *   them (ConsentGate, T7.2);
 * - a Dataview (DQL) note (L11 R1, which retires the light DQL dialog on import): `{ sf-version,
 *   checksum of the query block }`, exactly what ConsentGate computes from the note itself, so the
 *   collection draws without asking and a later edit reads as drift.
 * DataviewJS keeps the full disclosure; `null` means the user closed it.
 */
async function importTokens(
	deps: ImportFlowDeps,
	def: ViewDefinition,
): Promise<{ version: number; checksum: string } | null> {
	if (DECLARATIVE_ENGINES.has(def.engine)) return { version: def.version, checksum: def.checksum };
	return deps.gate.requestConsentForDef(def);
}

/**
 * What an import came to, for the modal to word (L11f): saved under `id`; `declined` (the
 * DataviewJS review was closed, nothing saved); or `failed` with the error (an `ImportError` such
 * as a late DUPLICATE, or anything unexpected, which is logged here).
 */
export type ImportOutcome =
	| { status: "imported"; id: string }
	| { status: "declined" }
	| { status: "failed"; error: unknown };

/** Dependencies injected into the import flow (all owned by main.ts). */
export interface ImportFlowDeps {
	app: App;
	importer: ViewImporter;
	gate: ConsentGate;
}

/**
 * Run the import flow for a parsed view definition and report its outcome. Never throws: a
 * rejecting consent dialog or store write is `failed` (logged when it is not an ImportError).
 *
 * Steps (nothing committed until step 2):
 *   1. Tokens — computed for Bases and DQL; DataviewJS asks (requestConsentForDef). Null
 *      (cancel / missing source) is `declined`.
 *   2. Commit — importToStore with the tokens + def.name label, once. A late DUPLICATE (race)
 *      or any other failure is `failed`; the modal shows it inline (L11f), not as a Notice.
 */
export async function runImportFlow(
	deps: ImportFlowDeps,
	def: ViewDefinition,
): Promise<ImportOutcome> {
	try {
		// Inside the try: a consent dialog that throws is a failure to report, not an escape.
		const tokens = await importTokens(deps, def);
		if (tokens === null) return { status: "declined" };
		const id = await deps.importer.importToStore(def, {
			okayed: tokens,
			enabled: true,
			commandName: def.name,
		});
		return { status: "imported", id };
	} catch (err) {
		// Unexpected (not an ImportError): log the real error; the modal shows a generic message.
		if (!(err instanceof ImportError)) console.error(err);
		return { status: "failed", error: err };
	}
}

/**
 * Install a curated catalog entry without a consent modal for declarative
 * engines (.base / DQL). DataviewJS entries still gate through
 * requestConsentForDef — a declined consent commits nothing.
 *
 * Both paths write provenance:"curated" (ADR-6 / T4.3).
 * A DUPLICATE source surfaces as an "up-to-date" Notice, not a raw error.
 *
 * @ref SDD/ADR-6 — curated gate-less install
 * @ref PRD/AC-F4.3 (.base/DQL 1-click), AC-F4.4 (DataviewJS gates)
 */
export async function installCurated(
	deps: ImportFlowDeps,
	def: ViewDefinition,
): Promise<void> {
	const isDeclarative = DECLARATIVE_ENGINES.has(def.engine);

	// Declarative engines (.base / DQL): skip the consent modal.
	// DataviewJS: always gate through requestConsentForDef.
	const tokens = isDeclarative
		? null
		: await deps.gate.requestConsentForDef(def);

	// DataviewJS with declined consent: abort with no store write.
	if (!isDeclarative && tokens === null) return;

	try {
		await deps.importer.importToStore(def, {
			provenance: "curated",
			enabled: true,
			okayed: tokens,
			commandName: def.name,
		});
	} catch (err) {
		if (err instanceof ImportError && err.code === "DUPLICATE") {
			// Already installed — surface as up-to-date, not an error.
			new Notice(`"${def.name}" is already installed and up-to-date.`);
			return;
		}
		console.error(err);
		new Notice("Install failed: unexpected error");
	}
}
