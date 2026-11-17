/**
 * Wording-only fixes: the settings header tagline and docs link, and the manifest description.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { augmentEl } from "obsidian";
import type { PluginManifest } from "obsidian";
import { HeaderSection } from "settings/HeaderSection";

describe("settings header", () => {
	const manifest = { id: "story-forge", name: "Story Forge", version: "1.0.0", minAppVersion: "1.5.7", description: "", author: "M" } as PluginManifest;

	it("has a real tagline and links Documentation to the docs index", () => {
		const el = augmentEl(document.createElement("div"));
		new HeaderSection({ plugin: { manifest } }).render(el);
		expect(el.querySelector(".sf-tagline")?.textContent).toBe(
			"Shows your story's entities from frontmatter in the Anvil and the Workbench, which follows the active note.",
		);
		const link = Array.from(el.querySelectorAll("a")).find((a) => a.textContent === "Documentation");
		expect(link?.getAttribute("href")).toBe("https://github.com/MMoMM-org/obsidian-story-forge/blob/main/docs/README.md");
	});
});

describe("manifest description", () => {
	const m = JSON.parse(readFileSync("manifest.json", "utf8")) as { description: string };
	const p = JSON.parse(readFileSync("package.json", "utf8")) as { description: string };

	it("follows the directory rules and matches package.json", () => {
		expect(m.description.endsWith(".")).toBe(true);
		expect(m.description.length).toBeLessThanOrEqual(250);
		expect(m.description).not.toMatch(/obsidian|plugin|sidebar|reference panels/i);
		expect(m.description).toMatch(/Anvil/);
		expect(p.description).toBe(m.description);
	});
});
