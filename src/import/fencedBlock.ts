/**
 * readFencedBlock — shared fenced-block extractor.
 *
 * Reads the single `dataview` or `dataviewjs` fenced code block from the
 * vault note at `sourcePath`. Returns the block language tag and body bytes
 * byte-exact (no CRLF normalisation). Returns null for any non-happy-path
 * case — never throws.
 *
 * Used by: ConsentGate (T1.3), ViewImporter (Phase 3), DataviewDqlEngine /
 * DataviewJsEngine (Phase 2). This contract must remain stable.
 *
 * @ref SDD/Building Block View — Directory Map (fencedBlock.ts entry)
 * @ref SDD/ADR-4 (byte-exact, no CRLF normalisation)
 */

import { TFile } from "obsidian";
import type { App } from "obsidian";
// The parser is `import/queryBlocks` (no `obsidian` import, so the Node catalog build shares it).
import { extractQueryBlocks } from "import/queryBlocks";

/**
 * Read the single dataview/dataviewjs fenced block from the note at
 * `sourcePath`.
 *
 * Returns null when:
 *  - The note does not exist (vault.getAbstractFileByPath → null).
 *  - The note has zero matching fenced blocks.
 *  - The note has more than one matching fenced block (ambiguous — callers
 *    must handle, e.g. ImportError("MULTIPLE_QUERY_BLOCKS")).
 *
 * Does NOT throw. Body bytes are returned as-is — no CRLF normalisation.
 */
export async function readFencedBlock(
	app: App,
	sourcePath: string,
): Promise<{ lang: string; body: string } | null> {
	// Guard: note must exist and must be a TFile (not a folder)
	const abstractFile = app.vault.getAbstractFileByPath(sourcePath);
	if (!(abstractFile instanceof TFile)) {
		return null;
	}

	// Read content via vault.read() — byte-exact string
	const content = await app.vault.read(abstractFile);

	// Extract fenced blocks with recognised language tags
	const blocks = extractQueryBlocks(content);

	// Exactly one block required
	if (blocks.length !== 1) {
		return null;
	}

	return blocks[0]!;
}

/**
 * readNoteContent — read the byte-exact content of the note at `sourcePath`,
 * or null if the path does not resolve to a TFile.
 *
 * Exposed so callers (e.g. ViewImporter.parse) can read the note ONCE and then
 * derive both the query-block count and the single block from the same content
 * via `extractQueryBlocks`, avoiding a second vault.read on the error path.
 */
export async function readNoteContent(
	app: App,
	sourcePath: string,
): Promise<string | null> {
	const abstractFile = app.vault.getAbstractFileByPath(sourcePath);
	if (!(abstractFile instanceof TFile)) {
		return null;
	}
	return app.vault.read(abstractFile);
}
