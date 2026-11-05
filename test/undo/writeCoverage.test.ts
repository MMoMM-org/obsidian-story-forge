/**
 * writeCoverage — every frontmatter write goes through the recorder-aware writer (AC-F1.8).
 *
 * Scans src/ for any use of processFrontMatter (comments stripped); only frontmatterWriter.ts may have one.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "../../src");
const WRITER = "inspector/frontmatterWriter.ts";
const CALL = /\bprocessFrontMatter\b/;

/** Drop // and /* *\/ comments so a mention in prose is not a use, and a use cannot hide in one. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		return /\.(ts|tsx)$/.test(name) ? [full] : [];
	});
}

describe("write coverage", () => {
	const callers = sourceFiles(SRC)
		.filter((f) => CALL.test(stripComments(readFileSync(f, "utf8"))))
		.map((f) => relative(SRC, f).split("\\").join("/"));

	it("finds the writer, so the scan is not vacuous", () => {
		expect(callers).toContain(WRITER);
	});

	it("calls processFrontMatter nowhere else in src/", () => {
		expect(callers.filter((f) => f !== WRITER)).toEqual([]);
	});
});
