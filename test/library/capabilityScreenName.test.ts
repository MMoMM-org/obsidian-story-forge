/**
 * The capability screen is "What Story Forge can use" (spec 010 O7). The old name became wrong once
 * Story Forge's own story files sit first on it, so none of the places that name it may keep it:
 * src/, test/, the user docs (docs/*.md) and the PRD. styles.css comments too.
 * docs/XDD/specs/008-* and the mockups keep the old name as history.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
// Built from parts so this file does not contain the phrase it forbids.
const OLD_NAME = ["What optional", "plugins add"].join(" ");

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (/\.(ts|md|css)$/.test(name)) out.push(path);
	}
	return out;
}

describe("capability screen name (O7)", () => {
	it("the old name is nowhere in src/, test/, styles.css, the user docs or the PRD", () => {
		const files = [
			...walk(join(ROOT, "src")),
			...walk(join(ROOT, "test")).filter((f) => !f.includes("/StoryForge/")),
			...readdirSync(join(ROOT, "docs")).filter((n) => n.endsWith(".md")).map((n) => join(ROOT, "docs", n)),
			join(ROOT, "styles.css"),
			join(ROOT, "docs/XDD/specs/010-ship-vault-artifacts/requirements.md"),
		];
		const hits = files.filter((f) => readFileSync(f, "utf8").includes(OLD_NAME)).map((f) => f.slice(ROOT.length + 1));
		expect(hits).toEqual([]);
	});
});
