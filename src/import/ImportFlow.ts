/**
 * runImportFlow — consent-then-commit import (T-S2.4, F2).
 * installCurated — gate-less 1-click install for curated catalog entries (T4.3).
 *
 * runImportFlow: pick → one consent gate → commit. The bind step was removed
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

/** Declarative engine kinds that do not require a consent modal on install. */
const DECLARATIVE_ENGINES = new Set<ViewDefinition["engine"]>(["dataview-dql"]);

/** Dependencies injected into the import flow (all owned by main.ts). */
export interface ImportFlowDeps {
	app: App;
	importer: ViewImporter;
	gate: ConsentGate;
}

/**
 * Run the consent-then-commit import flow for a parsed view definition.
 *
 * Steps (nothing committed until step 2):
 *   1. Consent — requestConsentForDef; null (cancel / missing source) aborts.
 *   2. Commit — importToStore with the consent tokens + def.name label, once.
 *
 * A late DUPLICATE (race) from importToStore surfaces a Notice and returns.
 */
export async function runImportFlow(
	deps: ImportFlowDeps,
	def: ViewDefinition,
): Promise<void> {
	// 1. Consent (no store write). Null = cancel/dismiss/missing source → abort.
	const tokens = await deps.gate.requestConsentForDef(def);
	if (tokens === null) return;

	// 2. Commit — single atomic write with the consent tokens. The tab label
	// defaults to the view's sf-name; command binding happens later via Settings.
	try {
		await deps.importer.importToStore(def, {
			okayed: tokens,
			enabled: true,
			commandName: def.name,
		});
	} catch (err) {
		if (err instanceof ImportError) {
			// e.g. a late DUPLICATE race: surface the message, commit nothing.
			new Notice(err.message);
			return;
		}
		// Unexpected: log the real error, show a generic message (mirrors picker).
		console.error(err);
		new Notice("Import failed: unexpected error");
		return;
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
