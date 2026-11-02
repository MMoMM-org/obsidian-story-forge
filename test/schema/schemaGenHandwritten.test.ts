/**
 * schema-gen script behaviour, run in temp vaults so the real
 * tree is never touched.
 *
 *  - the generator leaves a hand-written FileClass alone
 */

import { execFileSync } from "node:child_process";
import {
	mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
let work = "";
beforeEach(() => { work = mkdtempSync(path.join(tmpdir(), "schema-scripts-")); });
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

function gen(vault: string): void {
	execFileSync("node", ["scripts/schema-gen.mjs", "--vault", vault, "--no-ui-hints"], { cwd: ROOT, stdio: "pipe" });
}

describe("schema-gen and a hand-written FileClass", () => {
	it("leaves its bytes and mtime alone", () => {
		const vault = path.join(work, "vault");
		const dir = path.join(vault, "00 Meta/FileClasses");
		mkdirSync(dir, { recursive: true });
		const mine = path.join(dir, "fc-mine.md");
		writeFileSync(mine, "---\nextends: fc-character\nfields: []\n---\nhand-written\n");
		const past = new Date("2020-01-01T00:00:00Z");
		utimesSync(mine, past, past);
		const before = { bytes: readFileSync(mine, "utf8"), mtime: statSync(mine).mtimeMs };

		gen(vault);

		expect(readFileSync(path.join(dir, "fc-character.md"), "utf8")).not.toBe(""); // the run did generate
		expect(readFileSync(mine, "utf8")).toBe(before.bytes);
		expect(statSync(mine).mtimeMs).toBe(before.mtime);
	});
});
