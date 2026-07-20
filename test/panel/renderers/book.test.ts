/**
 * T3.4 — Book panel renderer tests (RED phase).
 *
 * Tests renderBook() against the DOM as the source of truth.
 * Book has the same shape as plotline: facts block + reverse scene list.
 *
 * Sections (in order):
 *   Facts   — subtitle / author / order / status / series (absent fields skipped)
 *   Scenes  — backlinks where kind==="scene" && field==="book"
 *             stable basename order (DV-3); count badge
 *             empty → emptyLine("No scenes in this book yet.")
 *
 * @ref mockups.html S40 note ("Same shape for book.")
 * @ref DV-3 (stable basename order)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderBook } from "panel/renderers/book";
import type { NoteContext } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeDeps(overrides?: Partial<PanelDeps>): PanelDeps {
	return {
		onOpenLink: () => {},
		collapsed: {},
		toggleCollapse: () => {},
		...overrides,
	};
}

function makeBookCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "50 Books/Wardens of Moonharbor.md",
		basename: "Wardens of Moonharbor",
	});
	return {
		activeFile,
		activeKind: "book",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Facts section
// ---------------------------------------------------------------------------

describe("renderBook: Facts section", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makeBookCtx({ frontmatter: { author: "Aleth Rainer" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields are present", () => {
		const ctx = makeBookCtx({ frontmatter: {} });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for subtitle when present", () => {
		const ctx = makeBookCtx({ frontmatter: { subtitle: "A Moonharbor Chronicle" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("subtitle");
	});

	it("renders factRow for author when present", () => {
		const ctx = makeBookCtx({ frontmatter: { author: "Aleth Rainer" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("author");
	});

	it("renders factRow for order when present", () => {
		const ctx = makeBookCtx({ frontmatter: { order: 1 } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("order");
	});

	it("renders factRow for status when present", () => {
		const ctx = makeBookCtx({ frontmatter: { status: "drafting" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("status");
	});

	it("renders factRow for series when present", () => {
		const ctx = makeBookCtx({ frontmatter: { series: "Forge" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("series");
	});

	it("skips fact fields absent from frontmatter", () => {
		const ctx = makeBookCtx({ frontmatter: { author: "Aleth Rainer" } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("subtitle");
		expect(keys).not.toContain("series");
	});

	it("joins array aliases with ', '", () => {
		const ctx = makeBookCtx({ frontmatter: { series: ["Forge", "Moonharbor"] } });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("Forge, Moonharbor");
	});
});

// ---------------------------------------------------------------------------
// Scenes section (reverse scene list — DV-3 basename order)
// ---------------------------------------------------------------------------

describe("renderBook: Scenes section", () => {
	it("renders a 'Scenes' section", () => {
		const ctx = makeBookCtx();
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Scenes")).toBe(true);
	});

	it("renders link rows for scene backlinks where field==='book'", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "book" },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 1 - The Extinguished Fire");
	});

	it("shows count badge with scene backlink count", () => {
		const scene1 = createMockTFile({ basename: "Scene 1 - A" });
		const scene2 = createMockTFile({ basename: "Scene 2 - B" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: scene1, kind: "scene", relation: "backlink", field: "book" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "book" },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const scenesHead = sectHeads.find((h) => h.textContent?.includes("Scenes"));
		expect(scenesHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("shows 'No scenes in this book yet.' when no scene backlinks", () => {
		const ctx = makeBookCtx({ backlinks: [] });
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this book yet.");
	});

	it("excludes backlinks with field other than 'book'", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this book yet.");
	});

	it("excludes backlinks whose kind is not 'scene'", () => {
		const charFile = createMockTFile({ basename: "Wardens Character" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: charFile, kind: "character", relation: "backlink", field: "book" },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this book yet.");
	});

	it("renders unresolvedEl (not linkRow) for an unresolved scene backlink", () => {
		const ghostFile = createMockTFile({ basename: "Ghost Scene", path: "Ghost Scene" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: ghostFile, kind: "scene", relation: "backlink", field: "book", unresolved: true },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		expect(el.querySelector(".sf-unres")).not.toBeNull();
		expect(el.querySelector(".sf-lrow-lnk")).toBeNull();
		expect(el.querySelector(".sf-unres")?.textContent).toContain("Ghost Scene");
	});

	it("renders scenes in stable basename order (DV-3)", () => {
		// Intentionally out of order — renderer must sort by basename
		const scene3 = createMockTFile({ basename: "Scene 3 - Zed" });
		const scene1 = createMockTFile({ basename: "Scene 1 - Alpha" });
		const scene2 = createMockTFile({ basename: "Scene 2 - Beta" });
		const ctx = makeBookCtx({
			backlinks: [
				{ file: scene3, kind: "scene", relation: "backlink", field: "book" },
				{ file: scene1, kind: "scene", relation: "backlink", field: "book" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "book" },
			],
		});
		const el = makeContainer();
		renderBook(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts.indexOf("Scene 1 - Alpha")).toBeLessThan(linkTexts.indexOf("Scene 2 - Beta"));
		expect(linkTexts.indexOf("Scene 2 - Beta")).toBeLessThan(linkTexts.indexOf("Scene 3 - Zed"));
	});
});
