/**
 * runImportFlow — consent-then-commit import (T-S2.4, F2).
 *
 * Import is pick → one consent gate → commit. The bind step was removed (F2):
 * clicking outside the (former) bind modal restarted the whole flow, and the
 * sibling markdown-mason plugin has no bind step either. Command binding is now
 * a separate Settings action (Edit), not part of the import flow.
 *
 * Consent tokens are collected on an in-memory ViewDefinition (no store id yet)
 * via ConsentGate.requestConsentForDef; only when consent grants tokens does
 * ViewImporter.importToStore commit a single fully-formed record. Cancelling
 * consent aborts with no store write. The imported view's tab label defaults to
 * its sf-name (def.name).
 *
 * @ref SDD/Runtime View — Flow C (import → consent → commit)
 * @ref SDD/ADR-4/ADR-5 (consent tokens), ADR-9 (store-generated id)
 * @ref PRD/AC-F3.4, AC-F3.6, AC-F3.7
 */

import { Notice } from "obsidian";
import type { App } from "obsidian";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import type { ConsentGate } from "consent/ConsentGate";

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
