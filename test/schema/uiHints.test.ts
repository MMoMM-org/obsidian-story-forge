/**
 * uiHints.test.ts — T6.1b (spec 008-codex-surface, Phase 6): the `wide` hint,
 * from `schema/*.json` all the way to a rendered field.
 *
 * A declaration nothing reads is the failure this file exists to catch, so the
 * end-to-end case opens a real `AnvilView` and looks at the rendered label, not
 * at the schema file. The entity list is read off disk (CLAUDE.md).
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-32
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, createMockCachedMetadata } from "obsidian";
import { collectUiHints, renderUiHintsModule } from "../../scripts/schema-ui-hints.mjs";
import { GENERATED_UI_HINTS } from "editor/generatedUiHints";
import { buildFieldModel } from "editor/fieldModel";
import type { ParsedFileClass } from "fileclass/fileClassTypes";
import { closePanes, fcFile, openPane, seedVault } from "../helpers/paneFixture";

const ROOT = path.resolve(__dirname, "../..");

interface SchemaFile { entity: string; fields: { name: string; type: string; ui?: string }[] }

function loadSchemas(): SchemaFile[] {
	const dir = path.join(ROOT, "schema");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as SchemaFile);
}

function schemaWith(ui: string): SchemaFile[] {
	return [{ entity: "demo", fields: [{ name: "blurb", type: "text", ui }] }];
}

describe("collectUiHints", () => {
	it("keys each hint by the FileClass that declares it", () => {
		expect(collectUiHints(schemaWith("wide"))).toEqual({ "fc-demo": { blurb: "wide" } });
	});

	it("rejects an unknown ui value, naming the entity, the field and the value", () => {
		expect(() => collectUiHints(schemaWith("image"))).toThrow(/demo\.blurb.*"image"/);
	});

	it("leaves a type with no hinted field out entirely", () => {
		const schemas: SchemaFile[] = [{ entity: "plain", fields: [{ name: "a", type: "text" }] }];
		expect(collectUiHints(schemas)).toEqual({});
	});
});

describe("the shipped schema", () => {
	it("declares ui:wide on tagline and nowhere else", () => {
		const hinted = loadSchemas().flatMap((s) =>
			s.fields.filter((f) => f.ui !== undefined).map((f) => `${s.entity}.${f.name}=${f.ui}`),
		);
		expect(hinted).toEqual(["character.tagline=wide"]);
	});

	it("keeps GENERATED_UI_HINTS equal to what schema/*.json declares (drift)", () => {
		expect(GENERATED_UI_HINTS).toEqual(collectUiHints(loadSchemas()));
	});

	it("keeps the checked-in generated module byte-equal to a fresh render (drift)", () => {
		const onDisk = readFileSync(path.join(ROOT, "src/editor/generatedUiHints.ts"), "utf8");
		expect(onDisk).toBe(renderUiHintsModule(collectUiHints(loadSchemas())));
	});
});

describe("the generated module", () => {
	it("renders an empty GENERATED_UI_HINTS when no schema declares a ui hint", () => {
		expect(renderUiHintsModule(collectUiHints([]))).toMatch(/GENERATED_UI_HINTS[^=]*=\s*\{\s*\};?/);
	});

	it("changes when a schema drops its ui", () => {
		const hinted = renderUiHintsModule(collectUiHints(schemaWith("wide")));
		const dropped = renderUiHintsModule(collectUiHints([{ entity: "demo", fields: [{ name: "blurb", type: "text" }] }]));
		expect(dropped).not.toBe(hinted);
		expect(hinted).toContain("blurb");
		expect(dropped).not.toContain("blurb");
	});
});

describe("the hint never reaches a FileClass", () => {
	let vault = "";
	beforeEach(() => {
		vault = mkdtempSync(path.join(tmpdir(), "uihints-vault-"));
	});
	afterEach(() => { rmSync(vault, { recursive: true, force: true }); });

	it("leaves the tracked generatedUiHints.ts untouched", () => {
		const real = path.join(ROOT, "src/editor/generatedUiHints.ts");
		const before = statSync(real).mtimeMs;
		execFileSync("node", ["scripts/schema-gen.mjs", "--vault", vault, "--no-ui-hints"], { cwd: ROOT, stdio: "pipe" });
		expect(statSync(real).mtimeMs).toBe(before);
	});

	it("generates FileClasses byte-identical to the checked-in ones, with no ui key", () => {
		execFileSync("node", ["scripts/schema-gen.mjs", "--vault", vault, "--no-ui-hints"], { cwd: ROOT, stdio: "pipe" });
		const fresh = path.join(vault, "00 Meta/FileClasses");
		const shipped = path.join(ROOT, "test/StoryForge/00 Meta/FileClasses");
		const names = readdirSync(shipped).filter((f) => f.endsWith(".md"));
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			expect(existsSync(path.join(fresh, name))).toBe(true);
			const text = readFileSync(path.join(fresh, name), "utf8");
			expect(text).toBe(readFileSync(path.join(shipped, name), "utf8"));
			expect(text).not.toMatch(/\bui:/);
		}
	});
});

function fileClass(name: string): ParsedFileClass {
	return {
		name,
		fields: [{ id: "f-t", name: "tagline", type: "Input" }],
	};
}

describe("applying hints in buildFieldModel", () => {
	it("makes tagline full width in the generated character FileClass", () => {
		const model = buildFieldModel([fileClass("fc-character")], {}, GENERATED_UI_HINTS);
		expect(model.sections[0]!.fields[0]!.width).toBe("full");
	});

	it("does not widen a user's own FileClass field that happens to be called tagline", () => {
		const model = buildFieldModel([fileClass("fc-mine")], {}, GENERATED_UI_HINTS);
		expect(model.sections[0]!.fields[0]!.width).toBe("half");
	});
});

describe("tagline in the running editor", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(async () => {
		await closePanes();
		vi.useRealTimers();
	});

	it("renders the tagline label full width through a real AnvilView", async () => {
		const app = new App();
		seedVault(app);
		const base = vi.mocked(app.metadataCache.getFileCache).getMockImplementation()!;
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((file) => {
			if (file.path !== fcFile.path) return base(file);
			return createMockCachedMetadata({
				frontmatter: {
					fieldsOrder: ["f-name", "f-tagline"],
					fields: [
						{ id: "f-name", name: "name", type: "Input" },
						{ id: "f-tagline", name: "tagline", type: "Input" },
					],
				},
			});
		});
		const view = await openPane(app);

		const labels = [...view.contentEl.querySelectorAll<HTMLElement>("label.sf-ed-label")];
		const byName = (n: string): HTMLElement => labels.find((l) => l.textContent === n)!;
		expect(byName("tagline").classList.contains("sf-ed-label--full")).toBe(true);
		expect(byName("name").classList.contains("sf-ed-label--full")).toBe(false);
	});
});
