/**
 * schema-check script behaviour, run in temp vaults so the real
 * tree is never touched.
 *
 *  - the check gate takes its type list from schema/*.json, so a new type is gated
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
	cpSync, mkdtempSync, rmSync, writeFileSync,
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

function check(vault: string, schemaDir: string): { status: number | null; out: string } {
	const r = spawnSync("node", ["scripts/schema-check.mjs", "--vault", vault, "--schema", schemaDir], {
		cwd: ROOT, encoding: "utf8",
	});
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
