/**
 * Plugin-rendered DOM sets no inline style declarations (#49).
 *
 * The community-plugin reviewer flags `el.style.x = …` because a theme can
 * only beat an inline style with `!important`. Runtime values reach the DOM
 * as CSS custom properties (`el.setCssProps({ "--sf-…": value })`), and
 * styles.css reads them, so a theme can still restyle every property.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function tsFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return tsFiles(p);
		return p.endsWith(".ts") ? [p] : [];
	});
}

describe("inline styles (#49)", () => {
	it("src/ assigns no style property and no inline custom property directly", () => {
		const hits = tsFiles(join(ROOT, "src")).flatMap((file) =>
			readFileSync(file, "utf8")
				.split("\n")
				.map((line, i) => ({ file: file.slice(ROOT.length + 1), line: i + 1, text: line.trim() }))
				.filter(({ text }) => /\.style\.[a-zA-Z]+\s*=(?!=)|\.style\.setProperty\(|\.style\.cssText/.test(text)),
		);
		expect(hits).toEqual([]);
	});

	it("styles.css reads every custom property the renderers set", () => {
		const css = readFileSync(join(ROOT, "styles.css"), "utf8");
		for (const prop of ["--sf-dot-color", "--sf-ghost-x", "--sf-ghost-y", "--sf-nav-progress", "--sf-zoom"]) {
			expect(css, prop).toContain(`var(${prop}`);
		}
	});
});
