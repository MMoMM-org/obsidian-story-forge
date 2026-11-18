/**
 * artifactContent.test.ts — spec 010, Phase 1 (T1.1–T1.3).
 *
 * The shipped vault artifacts (FileClasses, Templates, Schema reference) are
 * generated from `schema/`. They must work in any vault layout: no folder of
 * the development vault, no dev-vault defaults, `{{title}}` headings, the
 * value lists the fantasy FileClass needs, and a user-facing Schema index.
 *
 * Two views are checked: the unresolved sources (`renderArtifacts`, with
 * `{{sf:…}}` placeholders) and the dev vault schema-gen writes into a temp
 * folder (resolved with the default folders).
 *
 * @ref docs/XDD/specs/010-ship-vault-artifacts/solution.md — ADR-38, ADR-43
 * @ref docs/XDD/specs/010-ship-vault-artifacts/requirements.md — F5
 */

import { execFileSync } from "node:child_process";
import {
	cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface RenderedArtifact {
	set: "fileclasses" | "templates" | "schema";
	relPath: string;
	source: string;
}

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_DIR = path.join(ROOT, "schema");
const SET_DIR: Record<RenderedArtifact["set"], string> = {
	fileclasses: "FileClasses",
	templates: "Templates",
	schema: "Schema",
};
const VALUE_LISTS = ["fc-armor.md", "fc-combat-skills.md", "fc-magical-abilities.md"];
const BANNED = ["30 Canon", "10 Manuscript", "20 Planning", "95 Assets", "00 Meta/", "%title%", "%name%", '"Forge"'];

let renderArtifacts: (schemaDir: string) => RenderedArtifact[];
let templateNameOf: (s: { entity: string; template?: string }) => string;
let work = "";
let vault = "";
let sources: RenderedArtifact[] = [];

function gen(target: string, schemaDir: string = SCHEMA_DIR): void {
	execFileSync(
		"node",
		["scripts/schema-gen.mjs", "--vault", target, "--schema", schemaDir, "--no-ui-hints"],
		{ cwd: ROOT, stdio: "pipe" },
	);
}

const meta = (rel: string): string => readFileSync(path.join(vault, "00 Meta", rel), "utf8");
const source = (set: RenderedArtifact["set"], relPath: string): string => {
	const hit = sources.find((a) => a.set === set && a.relPath === relPath);
	if (!hit) throw new Error(`no rendered artifact ${set}/${relPath}`);
	return hit.source;
};
const schemaTypes = (dir: string = SCHEMA_DIR): Array<{ entity: string; hasTemplate?: boolean; template?: string }> =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { entity: string });
const frontmatter = (text: string): string => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
const bodyOf = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n/, "");

beforeAll(async () => {
	const mod = await import("../../scripts/schema-artifacts.mjs");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	renderArtifacts = mod.renderArtifacts as typeof renderArtifacts;
	templateNameOf = mod.templateNameOf as typeof templateNameOf;
	sources = renderArtifacts(SCHEMA_DIR);
	work = mkdtempSync(path.join(tmpdir(), "artifact-content-"));
	vault = path.join(work, "vault");
	gen(vault);
});
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

describe("FileClasses match by tag only (T1.1, PRD F5.5)", () => {
	it("have no filesPaths entries and no empty list items", () => {
		const fcs = sources.filter((a) => a.set === "fileclasses" && !VALUE_LISTS.includes(a.relPath));
		expect(fcs.length).toBe(schemaTypes().length);
		for (const fc of fcs) {
			expect(fc.source, fc.relPath).not.toMatch(/filesPaths:\n\s+- /);
			expect(fc.source, fc.relPath).not.toMatch(/^\s*-\s*$/m);
		}
	});

	it("query fc-lore's related notes by tag, not by folder", () => {
		const lore = source("fileclasses", "fc-lore.md");
		const line = lore.split("\n").find((l) => l.includes("dvQueryString")) ?? "";
		expect(line).toMatch(/dv\.pages\("#canon"\)/);
	});

	it("point character-fantasy's value lists at the FileClasses folder placeholder", () => {
		const fc = source("fileclasses", "fc-character-fantasy.md");
		const paths = fc.split("\n").filter((l) => l.includes("valuesListNotePath:"));
		expect(paths).toHaveLength(3);
		for (const p of paths) expect(p).toMatch(/valuesListNotePath: \{\{sf:fileClassesFolder\}\}\/fc-[a-z-]+\.md$/);
		// the dev vault receives the same source resolved with the default folder
		expect(meta("FileClasses/fc-character-fantasy.md")).toContain(
			"valuesListNotePath: 00 Meta/FileClasses/fc-armor.md",
		);
	});
});

describe("Templates have neutral defaults (T1.1, PRD F5.2/F5.6)", () => {
	const templates = (): RenderedArtifact[] => sources.filter((a) => a.set === "templates");

	it("leave series empty", () => {
		for (const t of templates()) {
			const fm = frontmatter(t.source);
			if (/^series:/m.test(fm)) expect(fm, t.relPath).toMatch(/^series: ""$/m);
		}
	});

	it("preset no gender", () => {
		expect(frontmatter(source("templates", "entity-character.md"))).toMatch(/^gender: ""(\s|$)/m);
	});

	it("start status at the first value of its list", () => {
		for (const s of schemaTypes() as Array<{ entity: string; hasTemplate?: boolean; fields: Array<{ name: string; values?: string[] }> }>) {
			if (s.hasTemplate === false) continue;
			const status = s.fields.find((f) => f.name === "status");
			if (!status?.values) continue;
			const fm = frontmatter(source("templates", templateNameOf(s)));
			expect(fm, s.entity).toMatch(new RegExp(`^status: ${status.values[0]}\\s`, "m"));
		}
	});
});

describe("Shipped sources name no dev-vault folder or default (T1.1, PRD F5.5)", () => {
	it("contain none of the banned strings", () => {
		for (const a of sources) {
			for (const banned of BANNED) expect(a.source, `${a.set}/${a.relPath}: ${banned}`).not.toContain(banned);
		}
	});
});

describe("Template bodies come from schema/templates (T1.2, PRD F5.1)", () => {
	it("open with a # {{title}} heading", () => {
		const templates = sources.filter((a) => a.set === "templates");
		expect(templates.length).toBeGreaterThan(0);
		for (const t of templates) {
			const heading = bodyOf(t.source).split("\n").find((l) => l.startsWith("# "));
			expect(heading, t.relPath).toBe("# {{title}}");
		}
	});

	it("generate into an empty vault with the bodies of schema/templates, VIEW lines intact", () => {
		const dir = path.join(SCHEMA_DIR, "templates");
		const bodies = readdirSync(dir).filter((f) => f.endsWith(".md"));
		expect(bodies.sort()).toEqual(sources.filter((a) => a.set === "templates").map((a) => a.relPath).sort());
		for (const name of bodies) {
			expect(bodyOf(meta(`Templates/${name}`)).trimStart(), name).toBe(readFileSync(path.join(dir, name), "utf8"));
		}
		expect(meta("Templates/entity-character.md")).toContain("`VIEW[{portrait}][image]`");
		expect(meta("Templates/entity-character.md")).toContain("**Height** `VIEW[{height}][text]` cm");
	});

	it("is idempotent: a second run changes no byte", () => {
		const second = path.join(work, "second");
		cpSync(vault, second, { recursive: true });
		gen(second);
		for (const a of sources) {
			const rel = path.join("00 Meta", SET_DIR[a.set], a.relPath);
			expect(readFileSync(path.join(second, rel), "utf8"), rel).toBe(readFileSync(path.join(vault, rel), "utf8"));
		}
	});

	it("does not keep a stale vault body: the schema body wins", () => {
		const stale = path.join(work, "stale");
		cpSync(vault, stale, { recursive: true });
		const tpl = path.join(stale, "00 Meta/Templates/entity-lore.md");
		writeFileSync(tpl, `${readFileSync(tpl, "utf8")}\nstale vault-only line\n`);
		gen(stale);
		expect(readFileSync(tpl, "utf8")).not.toContain("stale vault-only line");
	});
});

describe("Fantasy value lists ship with the FileClass set (T1.2, PRD F5.7)", () => {
	it("generate three empty value-list notes into FileClasses", () => {
		for (const name of VALUE_LISTS) {
			expect(source("fileclasses", name), name).toBe("");
			expect(existsSync(path.join(vault, "00 Meta/FileClasses", name)), name).toBe(true);
			expect(meta(`FileClasses/${name}`), name).toBe("");
		}
	});
});

describe("Schema index note (T1.3, PRD F5.3/F5.8)", () => {
	const readme = (): string => source("schema", "README.md");
	const rows = (text: string): string[] => text.split("\n").filter((l) => /^\| `[a-z-]+` \|/.test(l));

	it("lists every type read from schema/*.json, one row each", () => {
		const types = schemaTypes().map((s) => s.entity);
		expect(rows(readme())).toHaveLength(types.length);
		for (const t of types) expect(readme(), t).toContain(`| \`${t}\` |`);
	});

	it("names the FileClasses and templates folders only through placeholders", () => {
		expect(readme()).toContain("{{sf:fileClassesFolder}}");
		expect(readme()).toContain("{{sf:templatesFolder}}");
		expect(readme()).not.toMatch(/00 Meta|FileClasses\/|Templates\//);
		expect(meta("Schema/README.md")).toContain("`00 Meta/FileClasses`");
	});

	it("mentions no developer tooling", () => {
		for (const dev of ["schema:check", "schema:gen", "npm", "plugin repo", "_forge"]) {
			expect(readme(), dev).not.toContain(dev);
		}
	});

	it("gains a row for a new type JSON with no code change", () => {
		const dir = path.join(work, "schema-plus");
		cpSync(SCHEMA_DIR, dir, { recursive: true });
		writeFileSync(path.join(dir, "zine.json"), JSON.stringify({
			entity: "zine", icon: "book", folder: "", tag: "canon/zine", note: "A test-only type.", idPrefix: "z",
			fields: [{ name: "type", type: "fixed", value: "zine", description: "Fixed classifier." }],
		}));
		const plus = renderArtifacts(dir).find((a) => a.set === "schema" && a.relPath === "README.md")?.source ?? "";
		expect(rows(plus)).toHaveLength(rows(readme()).length + 1);
		expect(plus).toContain("| `zine` |");
	});

	it("rejects a valuesFrom outside the FileClasses folder", () => {
		const dir = path.join(work, "schema-bad-values");
		cpSync(SCHEMA_DIR, dir, { recursive: true });
		writeFileSync(path.join(dir, "bad.json"), JSON.stringify({
			entity: "bad", icon: "book", folder: "", tag: "canon/bad", note: "A test-only type.", idPrefix: "b",
			fields: [{ name: "kind", type: "list", valuesFrom: "00 Meta/FileClasses/fc-x.md", description: "Bad." }],
		}));
		expect(() => renderArtifacts(dir)).toThrow(/valuesFrom must start with/);
	});
});
