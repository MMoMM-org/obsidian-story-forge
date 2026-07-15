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

// ---------------------------------------------------------------------------
// Internal parser
// ---------------------------------------------------------------------------

/**
 * Extract all fenced blocks whose language tag is "dataview" or "dataviewjs"
 * from `content`. Returns each as {lang, body} where body is the raw text
 * between the opening and closing fence delimiters (byte-exact).
 */
function extractQueryBlocks(
	content: string,
): Array<{ lang: string; body: string }> {
	const blocks: Array<{ lang: string; body: string }> = [];

	// Regex: matches ```<lang>\n<body>``` where lang is dataview or dataviewjs.
	// Uses non-greedy body match. The fence must start at the beginning of a
	// line (multiline mode). Body may be empty.
	//
	// We do NOT use a single-pass regex with back-references to the fence
	// length (```) because the spec only uses triple-backtick fences. A simple
	// line-by-line parser is clearest and most explicit.
	const lines = splitLines(content);
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;
		// Look for opening fence: ```<lang> (optionally with trailing whitespace)
		const openMatch = line.match(/^```([a-zA-Z][a-zA-Z0-9-]*)[ \t\r]*$/);
		if (openMatch) {
			const lang = openMatch[1]!;
			if (QUERY_LANGS.has(lang)) {
				// Collect body lines until the closing fence (```) or EOF
				i++;
				const bodyLines: string[] = [];
				while (i < lines.length && !isClosingFence(lines[i]!)) {
					bodyLines.push(lines[i]!);
					i++;
				}
				// Reconstruct body with original line terminators
				const body = bodyLines.length > 0 ? bodyLines.join("\n") + "\n" : "";
				// Adjust: if the original content uses CRLF, the body lines
				// already have CR stripped by splitLines. We must reconstruct
				// the body preserving the original terminators per byte-exact spec.
				blocks.push({ lang, body: extractRawBody(content, lang, body) });
				// Skip past the closing fence line
				if (i < lines.length && isClosingFence(lines[i]!)) {
					i++;
				}
				continue;
			}
		}
		i++;
	}

	return blocks;
}

/**
 * Split content into lines WITHOUT stripping the CR from CRLF pairs.
 * We do this by only splitting on bare LF.
 */
function splitLines(content: string): string[] {
	return content.split("\n");
}

function isClosingFence(line: string): boolean {
	// A closing fence is ``` optionally followed by whitespace (and possibly CR)
	return /^```[ \t\r]*$/.test(line);
}

/**
 * Extract the raw body bytes from the original content string.
 *
 * The line-by-line splitter above (splitting on \n) already preserves CR
 * characters inside each "line" because we only split on \n. So lines like
 * "LIST FROM #canon\r" are kept intact. We just need to rejoin them with the
 * original \n separator.
 *
 * This function re-derives the body directly from the content by finding the
 * opening fence and extracting until the closing fence, preserving every byte.
 */
function extractRawBody(
	content: string,
	lang: string,
	_naiveBody: string,
): string {
	// Find the opening fence line for this lang tag in the original content.
	// Pattern: (^|\n)```<lang><optional whitespace>\n<body>```
	const openFence = "```" + lang;
	let searchFrom = 0;
	while (searchFrom < content.length) {
		const fenceIdx = content.indexOf(openFence, searchFrom);
		if (fenceIdx === -1) break;

		// Verify it's at the start of a line
		const prevChar = fenceIdx === 0 ? "\n" : content[fenceIdx - 1];
		if (prevChar !== "\n") {
			searchFrom = fenceIdx + 1;
			continue;
		}

		// Verify what follows the lang tag is optional whitespace then \n
		const afterLang = fenceIdx + openFence.length;
		const eolIdx = content.indexOf("\n", afterLang);
		if (eolIdx === -1) {
			searchFrom = fenceIdx + 1;
			continue;
		}
		const between = content.slice(afterLang, eolIdx);
		if (!/^[ \t\r]*$/.test(between)) {
			searchFrom = fenceIdx + 1;
			continue;
		}

		// Body starts right after the \n
		const bodyStart = eolIdx + 1;

		// Find the closing fence: a line that is exactly ```
		const closingFenceMatch = findClosingFence(content, bodyStart);
		if (closingFenceMatch === -1) {
			// No closing fence — not a valid block
			searchFrom = fenceIdx + 1;
			continue;
		}

		const body = content.slice(bodyStart, closingFenceMatch);
		return body;
	}

	return _naiveBody;
}

/**
 * Find the start index of the closing fence (```) line in `content`, starting
 * the search from `from`. Returns the index of the first character of the
 * closing fence line, or -1 if not found.
 */
function findClosingFence(content: string, from: number): number {
	let i = from;
	while (i < content.length) {
		const eol = content.indexOf("\n", i);
		const lineEnd = eol === -1 ? content.length : eol;
		const line = content.slice(i, lineEnd);
		if (/^```[ \t\r]*$/.test(line)) {
			return i;
		}
		i = lineEnd + 1;
	}
	return -1;
}
