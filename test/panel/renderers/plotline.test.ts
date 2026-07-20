/**
 * T3.4 — Plotline panel renderer tests (RED phase).
 *
 * Tests renderPlotline() against the DOM as the source of truth.
 * Mockup state exercised: S40.
 *
 * Sections (in order):
 *   Facts   — logline / status / series (absent fields skipped)
 *   Scenes  — backlinks where kind==="scene" && field==="plotlines"
 *             stable basename order (DV-3); count badge
 *             empty → emptyLine("No scenes in this plotline yet.")
 *
 * @ref mockups.html S40
 * @ref DV-3 (stable basename order; do NOT sort by scene.order)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderPlotline } from "panel/renderers/plotline";
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

function makePlotCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "40 Plotlines/The Dying Light.md",
		basename: "The Dying Light",
	});
	return {
		activeFile,
		activeKind: "plotline",
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

describe("renderPlotline: Facts section (S40)", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makePlotCtx({ frontmatter: { series: "Forge" } });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields are present", () => {
		const ctx = makePlotCtx({ frontmatter: {} });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for logline when present", () => {
		const ctx = makePlotCtx({ frontmatter: { logline: "The lighthouse goes dark." } });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("logline");
	});

	it("renders factRow for status when present", () => {
		const ctx = makePlotCtx({ frontmatter: { status: "active" } });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("status");
	});

	it("renders factRow for series when present", () => {
		const ctx = makePlotCtx({ frontmatter: { series: "Forge" } });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("series");
	});

	it("skips fact fields absent from frontmatter", () => {
		const ctx = makePlotCtx({ frontmatter: { series: "Forge" } });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("logline");
		expect(keys).not.toContain("status");
	});
});

// ---------------------------------------------------------------------------
// Scenes section (reverse scene list — DV-3 basename order)
// ---------------------------------------------------------------------------

describe("renderPlotline: Scenes section (S40)", () => {
	it("renders a 'Scenes' section", () => {
		const ctx = makePlotCtx();
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Scenes")).toBe(true);
	});

	it("renders link rows for scene backlinks where field==='plotlines'", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 1 - The Extinguished Fire");
	});

	it("shows count badge with scene backlink count", () => {
		const scene1 = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const scene2 = createMockTFile({ basename: "Scene 2 - The Salty Gull" });
		const scene3 = createMockTFile({ basename: "Scene 3 - The Black Cliffs" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: scene1, kind: "scene", relation: "backlink", field: "plotlines" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "plotlines" },
				{ file: scene3, kind: "scene", relation: "backlink", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const scenesHead = sectHeads.find((h) => h.textContent?.includes("Scenes"));
		expect(scenesHead?.querySelector(".sf-count")?.textContent).toBe("3");
	});

	it("shows 'No scenes in this plotline yet.' when no scene backlinks", () => {
		const ctx = makePlotCtx({ backlinks: [] });
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this plotline yet.");
	});

	it("excludes backlinks with field other than 'plotlines'", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "book" },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this plotline yet.");
	});

	it("excludes backlinks whose kind is not 'scene'", () => {
		const charFile = createMockTFile({ basename: "Some Character" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: charFile, kind: "character", relation: "backlink", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes in this plotline yet.");
	});

	it("renders unresolvedEl (not linkRow) for an unresolved scene backlink", () => {
		const ghostFile = createMockTFile({ basename: "Ghost Scene", path: "Ghost Scene" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: ghostFile, kind: "scene", relation: "backlink", field: "plotlines", unresolved: true },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		expect(el.querySelector(".sf-unres")).not.toBeNull();
		expect(el.querySelector(".sf-lrow-lnk")).toBeNull();
		expect(el.querySelector(".sf-unres")?.textContent).toContain("Ghost Scene");
	});

	it("renders scenes in stable basename order (DV-3)", () => {
		// Intentionally out of order — renderer must sort by basename
		const scene3 = createMockTFile({ basename: "Scene 3 - Zed" });
		const scene1 = createMockTFile({ basename: "Scene 1 - Alpha" });
		const scene2 = createMockTFile({ basename: "Scene 2 - Beta" });
		const ctx = makePlotCtx({
			backlinks: [
				{ file: scene3, kind: "scene", relation: "backlink", field: "plotlines" },
				{ file: scene1, kind: "scene", relation: "backlink", field: "plotlines" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderPlotline(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		// Scene 1 basename sorts before Scene 2, Scene 3
		expect(linkTexts.indexOf("Scene 1 - Alpha")).toBeLessThan(linkTexts.indexOf("Scene 2 - Beta"));
		expect(linkTexts.indexOf("Scene 2 - Beta")).toBeLessThan(linkTexts.indexOf("Scene 3 - Zed"));
	});
});
