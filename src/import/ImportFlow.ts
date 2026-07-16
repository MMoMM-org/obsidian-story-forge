/**
 * runImportFlow — deferred-atomic one-flow import (T-S2.4).
 *
 * Sequences the consent → bind → commit → register-command steps so that
 * NOTHING is committed to the store until the very end. Cancelling consent OR
 * going Back at the bind step aborts the flow with no store write and no
 * command registration.
 *
 * Consent tokens are collected on an in-memory ViewDefinition (no store id yet)
 * via ConsentGate.requestConsentForDef; the bind step is a pure UI step
 * (BindModal.present) that resolves the label + command choice; only then does
 * ViewImporter.importToStore commit a single fully-formed record, and — if the
 * user asked — registerCommand wires the palette entry against the store id.
 *
 * @ref SDD/Runtime View — Flow C (import → consent → bind → commit)
 * @ref SDD/ADR-4/ADR-5 (consent tokens), ADR-9 (store-generated id)
 * @ref PRD/AC-F3.4, AC-F3.6, AC-F3.7
 */

import { Notice } from "obsidian";
import type { App } from "obsidian";
import { BindModal } from "import/BindModal";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import type { ConsentGate } from "consent/ConsentGate";
import type { RegisterCommandCallback } from "import/types";

/** Dependencies injected into the import flow (all owned by main.ts). */
export interface ImportFlowDeps {
	app: App;
	importer: ViewImporter;
	gate: ConsentGate;
	registerCommand: RegisterCommandCallback;
}

/**
 * Run the deferred-atomic import flow for a parsed view definition.
 *
 * Steps (nothing committed until step 3):
 *   1. Consent — requestConsentForDef; null (cancel / missing source) aborts.
 *   2. Bind — BindModal.present; null (Back / dismiss) aborts.
 *   3. Commit — importToStore with the consent tokens + bind label, once.
 *   4. Register command — only when the user checked "Register as command".
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

	// 2. Bind (pure UI, no store write). Null = Back/dismiss → abort.
	const bind = await new BindModal(deps.app, {
		name: def.name,
		registerCommand: def.command,
	}).present();
	if (bind === null) return;

	// 3. Commit — single atomic write with the consent tokens + bind label.
	let id: string;
	try {
		id = await deps.importer.importToStore(def, {
			okayed: tokens,
			enabled: true,
			commandName: bind.label,
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

	// 4. Register command palette entry only when requested.
	if (bind.registerCommand) {
		deps.registerCommand(id, bind.commandName);
	}
}
