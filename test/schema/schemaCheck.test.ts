/**
 * schema-check script behaviour, run in temp vaults so the real
 * tree is never touched.
 *
 *  - the check gate takes its type list from schema/*.json, so a new type is gated
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const NEW_TYPE = {
	entity: "zine",
	icon: "book",
	folder: "40 Zines",
	tag: "canon/zine",
	note: "A test-only type.",
	idPrefix: "z",
	fields: [
		{ name: "type", type: "fixed", value: "zine", description: "Fixed classifier." },
		{ name: "name", type: "text", description: "Text." },
	],
};

let work = "";
beforeEach(() => { work = mkdtempSync(path.join(tmpdir(), "schema-scripts-")); });
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

function gen(vault: string, schemaDir: string = path.join(ROOT, "schema")): void {
	execFileSync(
		"node",
		["scripts/schema-gen.mjs", "--vault", vault, "--schema", schemaDir, "--no-ui-hints"],
		{ cwd: ROOT, stdio: "pipe" },
	);
}

/** `dist` defaults to a directory with no index, so a temp schema is not judged against the repo's dist/. */
function check(
	vault: string,
	schemaDir: string,
	dist: string = path.join(work, "no-dist"),
): { status: number | null; out: string } {
	const r = spawnSync(
		"node",
		["scripts/schema-check.mjs", "--vault", vault, "--schema", schemaDir, "--dist", dist],
		{ cwd: ROOT, encoding: "utf8" },
	);
	return { status: r.status, out: r.stdout };
}

/** schema/ copied into a temp dir, plus one type the repo has never heard of. */
function schemaWithNewType(): string {
	const dir = path.join(work, "schema");
	cpSync(path.join(ROOT, "schema"), dir, { recursive: true });
	writeFileSync(path.join(dir, "zine.json"), JSON.stringify(NEW_TYPE));
	return dir;
}

describe("schema-check type list", () => {
	it("gates a type that exists only as a schema file", () => {
		const schemaDir = schemaWithNewType();
		const vault = path.join(work, "vault");
		gen(vault, schemaDir);

		const ok = check(vault, schemaDir);
		expect(ok.out).toContain("✓ zine: 2 properties documented");
		expect(ok.status).toBe(0);

		rmSync(path.join(vault, "00 Meta/Schema/zine.md"));
		const broken = check(vault, schemaDir);
		expect(broken.out).toContain("✗ zine: missing reference note");
		expect(broken.status).toBe(1);
	});
});

describe("schema-check shipped artifacts", () => {
	const SCENE_FILES = [
		"00 Meta/FileClasses/fc-scene.md",
		"00 Meta/Templates/scene.md",
		"00 Meta/Schema/scene.md",
	];

	function genVault(schemaDir: string = path.join(ROOT, "schema")): string {
		const vault = path.join(work, "vault");
		gen(vault, schemaDir);
		return vault;
	}

	it("passes on a freshly generated vault", () => {
		const vault = genVault();
		const r = check(vault, path.join(ROOT, "schema"));
		expect(r.out).toMatch(/✓ artifacts: \d+ dev-vault file\(s\) equal the shipped set/);
		expect(r.status).toBe(0);
	});

	it.each(SCENE_FILES)("fails naming %s when one byte differs", (rel) => {
		const vault = genVault();
		appendFileSync(path.join(vault, rel), " ");
		const r = check(vault, path.join(ROOT, "schema"));
		expect(r.out).toContain(`✗ artifacts: ${rel}`);
		expect(r.status).toBe(1);
	});

	it("fails when a shipped artifact is missing from the dev vault", () => {
		const vault = genVault();
		rmSync(path.join(vault, "00 Meta/FileClasses/fc-scene.md"));
		const r = check(vault, path.join(ROOT, "schema"));
		expect(r.out).toContain("✗ artifacts: missing 00 Meta/FileClasses/fc-scene.md");
		expect(r.status).toBe(1);
	});

	it("ignores files in those folders that are not shipped", () => {
		const vault = genVault();
		writeFileSync(path.join(vault, "00 Meta/Templates/my-own.md"), "mine");
		expect(check(vault, path.join(ROOT, "schema")).status).toBe(0);
	});

	describe("artifact index", () => {
		function buildDist(): string {
			const dist = path.join(work, "dist");
			execFileSync("node", ["scripts/build-artifacts.mjs", "--out", dist], { cwd: ROOT, stdio: "pipe" });
			return dist;
		}

		it("passes when the index equals a fresh build", () => {
			const vault = genVault();
			const r = check(vault, path.join(ROOT, "schema"), buildDist());
			expect(r.out).toContain("✓ artifact index");
			expect(r.status).toBe(0);
		});

		it("fails with the artifacts:build hint when an entry source is stale", () => {
			const vault = genVault();
			const dist = buildDist();
			const file = path.join(dist, "artifact-index.json");
			const idx = JSON.parse(readFileSync(file, "utf8"));
			idx.entries[0].source += "x";
			writeFileSync(file, JSON.stringify(idx, null, 2) + "\n");
			const r = check(vault, path.join(ROOT, "schema"), dist);
			expect(r.out).toContain("stale");
			expect(r.out).toContain("npm run artifacts:build");
			expect(r.status).toBe(1);
		});
	});

	describe("banned text in shipped sources", () => {
		it.each([
			"00 Meta/", "30 Canon", "10 Manuscript", "20 Planning",
			"95 Assets", "%title%", "%name%", "\"Forge\"",
		])("fails naming %s", (banned) => {
			const schemaDir = path.join(work, "schema");
			cpSync(path.join(ROOT, "schema"), schemaDir, { recursive: true });
			appendFileSync(path.join(schemaDir, "templates/entity-character.md"), `\nleak: ${banned}\n`);
			const vault = genVault(schemaDir);
			const r = check(vault, schemaDir);
			expect(r.out).toContain(`banned text ${JSON.stringify(banned)}`);
			expect(r.status).toBe(1);
		});
	});
});
