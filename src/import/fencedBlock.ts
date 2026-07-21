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

/** Language tags this extractor recognises. */
const QUERY_LANGS = new Set(["dataview", "dataviewjs"]);

/**
 * readViewSource — bases-aware source reader.
 *
 * For `bases` engine records: returns `record.source` as-is (the raw .base
 * YAML string). The YAML is stored directly on the record — there is no vault
 * file to read and no fenced block to parse (ADR-5).
 *
 * For `dataview-dql` / `dataviewjs` engine records: delegates to
 * readFencedBlock and returns its body string, or null on any non-happy path.
 *
 * Does NOT throw. Preserves the existing readFencedBlock contract for all
 * non-bases callers.
 *
 * @ref SDD/ADR-5 (bases record source model — raw YAML, not a vault fenced block)
 */
export async function readViewSource(
	app: App,
	record: { engine: string; source: string },
): Promise<string | null> {
	if (record.engine === "bases") {
		return record.source;
	}
	const block = await readFencedBlock(app, record.source);
	return block !== null ? block.body : null;
}

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

// ---------------------------------------------------------------------------
// Internal parser
// ---------------------------------------------------------------------------

/**
 * Extract all TOP-LEVEL fenced blocks whose language tag is "dataview" or
 * "dataviewjs" from `content`. Returns each as {lang, body} where body is the
 * raw text between the opening and closing fence delimiters, byte-exact.
 *
 * Exported as the single source of truth for the "exactly one query block"
 * rule: both `readFencedBlock` (here) and `ViewImporter.parse` derive their
 * block count / single-block extraction from this one parser.
 *
 * The parser walks the content line-by-line, tracking the open/close of ANY
 * ```-fenced block. A fence found while already inside a block is treated as
 * that block's closing fence (or as body text), NOT as a new opening fence.
 * This prevents a ```dataview line that lives inside a non-query block body
 * (e.g. a ```text or ```bash block documenting a query) from being falsely
 * counted as a query block (W-1).
 *
 * Byte-exactness: `content` is split on bare `\n` only, so each element keeps
 * any trailing CR. The body is reconstructed by slicing the original content
 * between recorded byte offsets — no CRLF normalisation.
 */
export function extractQueryBlocks(
	content: string,
): Array<{ lang: string; body: string }> {
	const blocks: Array<{ lang: string; body: string }> = [];

	// Line records with their absolute start offset in `content` (splitting on
	// bare \n preserves CR bytes inside each line — byte-exact).
	const lines = content.split("\n");
	const lineStart: number[] = [];
	{
		let off = 0;
		for (const line of lines) {
			lineStart.push(off);
			off += line.length + 1; // +1 for the \n that split consumed
		}
	}

	let i = 0;
	while (i < lines.length) {
		const openMatch = lines[i]!.match(/^```([a-zA-Z][a-zA-Z0-9-]*)[ \t\r]*$/);
		if (!openMatch) {
			i++;
			continue;
		}

		const lang = openMatch[1]!;
		const isQuery = QUERY_LANGS.has(lang);

		// Body begins at the start of the line AFTER the opening fence.
		const bodyStartLine = i + 1;
		// Scan forward to the closing fence, skipping this block's entire body.
		let j = bodyStartLine;
		while (j < lines.length && !isClosingFence(lines[j]!)) {
			j++;
		}

		if (isQuery) {
			// Byte-exact body: from the start of the first body line to the
			// start of the closing fence line (exclusive). Empty when the block
			// has no body lines. bodyStart/bodyEnd are undefined only past EOF,
			// in which case there is no body → "".
			const bodyStart = lineStart[bodyStartLine];
			const bodyEnd = lineStart[j];
			const body =
				bodyStart !== undefined && bodyEnd !== undefined && j > bodyStartLine
					? content.slice(bodyStart, bodyEnd)
					: "";
			blocks.push({ lang, body });
		}

		// Advance past the closing fence (or to EOF if none), regardless of kind,
		// so a non-query block body is never re-scanned for opening fences.
		i = j < lines.length ? j + 1 : j;
	}

	return blocks;
}

/** A closing fence is ``` optionally followed by whitespace (and possibly CR). */
function isClosingFence(line: string): boolean {
	return /^```[ \t\r]*$/.test(line);
}
