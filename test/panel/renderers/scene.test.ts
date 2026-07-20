/**
 * T3.4 — Scene panel renderer tests (RED phase).
 *
 * Tests renderScene() against the DOM as the source of truth.
 * Mockup state exercised: S39.
 *
 * Sections (in order):
 *   subtitle line — present only when frontmatter.subtitle is set
 *   Facts         — scene fact fields + book link row in the Facts body
 *   Point of view — entities field==="pov"; pov tag
 *   Characters    — entities field==="characters"; count badge
 *   Location      — entities field==="location"
 *   Plotlines     — entities field==="plotlines"; count badge
 *   Reading order — prev / next link rows (em-dash when absent)
 *
 * Unresolved entities render unresolvedEl.
 * Empty sections render emptyLine where mockup shows them.
 *
 * @ref mockups.html S39
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderScene } from "panel/renderers/scene";
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

function makeSceneCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "20 Scenes/Scene 1 - The Extinguished Fire.md",
		basename: "Scene 1 - The Extinguished Fire",
	});
	return {
		activeFile,
		activeKind: "scene",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Subtitle line
// ---------------------------------------------------------------------------

describe("renderScene: subtitle line", () => {
	it("renders subtitle text when frontmatter.subtitle is set", () => {
		const ctx = makeSceneCtx({ frontmatter: { subtitle: "Mara finds the lens gone cold." } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const subtitle = el.querySelector(".sf-subtitle");
		expect(subtitle).not.toBeNull();
		expect(subtitle?.textContent).toBe("Mara finds the lens gone cold.");
	});

	it("omits the subtitle element when frontmatter.subtitle is absent", () => {
		const ctx = makeSceneCtx({ frontmatter: {} });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const subtitle = el.querySelector(".sf-subtitle");
		expect(subtitle).toBeNull();
	});

	it("omits the subtitle element when frontmatter.subtitle is empty string", () => {
		const ctx = makeSceneCtx({ frontmatter: { subtitle: "" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const subtitle = el.querySelector(".sf-subtitle");
		expect(subtitle).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Facts section (includes book link row)
// ---------------------------------------------------------------------------

describe("renderScene: Facts section (S39)", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makeSceneCtx({ frontmatter: { status: "draft" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields present and no book entity", () => {
		const ctx = makeSceneCtx({ frontmatter: {}, entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for act when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { act: 1 } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("act");
	});

	it("renders factRow for chapter when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { chapter: 1 } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("chapter");
	});

	it("renders factRow for order when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { order: 1 } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("order");
	});

	it("renders factRow for when when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { when: "Night 1 (day 1)" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("when");
	});

	it("renders factRow for status when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { status: "draft" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("status");
	});

	it("renders factRow for arc when present", () => {
		const ctx = makeSceneCtx({ frontmatter: { arc: "Mara takes responsibility" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("arc");
	});

	it("skips fact fields absent from frontmatter", () => {
		const ctx = makeSceneCtx({ frontmatter: { status: "draft" } });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("arc");
		expect(keys).not.toContain("when");
	});

	it("renders a link row for the book entity inside the Facts section", () => {
		const bookFile = createMockTFile({ basename: "Wardens of Moonharbor" });
		const ctx = makeSceneCtx({
			frontmatter: {},
			entities: [
				{ file: bookFile, kind: "book", relation: "outgoing", field: "book" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		// The book link should appear inside the Facts body
		const factsSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Facts",
		);
		expect(factsSection).not.toBeNull();
		const linkText = [...(factsSection?.querySelectorAll(".sf-lrow-lnk") ?? [])].map((l) => l.textContent);
		expect(linkText).toContain("Wardens of Moonharbor");
	});

	it("renders Facts section when only a book entity is present (no other fact fields)", () => {
		const bookFile = createMockTFile({ basename: "Wardens of Moonharbor" });
		const ctx = makeSceneCtx({
			frontmatter: {},
			entities: [
				{ file: bookFile, kind: "book", relation: "outgoing", field: "book" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("renders unresolvedEl for unresolved book entity in Facts section", () => {
		const ghostBook = createMockTFile({ basename: "Ghost Book", path: "Ghost Book" });
		const ctx = makeSceneCtx({
			frontmatter: {},
			entities: [
				{ file: ghostBook, kind: "unknown", relation: "outgoing", field: "book", unresolved: true },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const unres = el.querySelector(".sf-unres");
		expect(unres).not.toBeNull();
		expect(unres?.textContent).toContain("Ghost Book");
	});
});

// ---------------------------------------------------------------------------
// Point of view section
// ---------------------------------------------------------------------------

describe("renderScene: Point of view section (S39)", () => {
	it("renders a 'Point of view' section", () => {
		const ctx = makeSceneCtx();
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Point of view")).toBe(true);
	});

	it("renders a link row for each pov entity", () => {
		const povFile = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: povFile, kind: "character", relation: "outgoing", field: "pov" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Mara Stoneway");
	});

	it("tags each pov link row with 'pov' trail tag", () => {
		const povFile = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: povFile, kind: "character", relation: "outgoing", field: "pov" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		// Find the pov section by its label
		const povSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Point of view",
		);
		const trails = [...(povSection?.querySelectorAll(".sf-trail") ?? [])].map((t) => t.textContent);
		expect(trails).toContain("pov");
	});

	it("renders unresolvedEl for unresolved pov entity", () => {
		const ghostFile = createMockTFile({ basename: "Unknown Pov", path: "Unknown Pov" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "pov", unresolved: true },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const unres = el.querySelector(".sf-unres");
		expect(unres).not.toBeNull();
	});

	it("renders emptyLine when no pov entities", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const povSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Point of view",
		);
		const empty = povSection?.querySelector(".sf-emptyline");
		expect(empty).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Characters section
// ---------------------------------------------------------------------------

describe("renderScene: Characters section (S39)", () => {
	it("renders a 'Characters' section with a count badge", () => {
		const char1 = createMockTFile({ basename: "Mara Stoneway" });
		const char2 = createMockTFile({ basename: "Tobias Ferro" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: char1, kind: "character", relation: "outgoing", field: "characters" },
				{ file: char2, kind: "character", relation: "outgoing", field: "characters" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Characters")).toBe(true);

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const charsHead = sectHeads.find((h) => h.textContent?.includes("Characters"));
		expect(charsHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("renders link rows for each characters entity", () => {
		const charFile = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: charFile, kind: "character", relation: "outgoing", field: "characters" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const charsSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Characters",
		);
		const linkTexts = [...(charsSection?.querySelectorAll(".sf-lrow-lnk") ?? [])].map((l) => l.textContent);
		expect(linkTexts).toContain("Mara Stoneway");
	});

	it("renders count badge as 0 and emptyLine when no characters entities", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const charsHead = sectHeads.find((h) => h.textContent?.includes("Characters"));
		expect(charsHead?.querySelector(".sf-count")?.textContent).toBe("0");

		const charsSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Characters",
		);
		expect(charsSection?.querySelector(".sf-emptyline")).not.toBeNull();
	});

	it("renders unresolvedEl for unresolved character entity", () => {
		const ghostFile = createMockTFile({ basename: "Missing Char", path: "Missing Char" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "characters", unresolved: true },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const charsSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Characters",
		);
		expect(charsSection?.querySelector(".sf-unres")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Location section
// ---------------------------------------------------------------------------

describe("renderScene: Location section (S39)", () => {
	it("renders a 'Location' section", () => {
		const ctx = makeSceneCtx();
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Location")).toBe(true);
	});

	it("renders a link row for the location entity", () => {
		const locFile = createMockTFile({ basename: "Moonharbor Lighthouse" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: locFile, kind: "location", relation: "outgoing", field: "location" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const locSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Location",
		);
		const linkTexts = [...(locSection?.querySelectorAll(".sf-lrow-lnk") ?? [])].map((l) => l.textContent);
		expect(linkTexts).toContain("Moonharbor Lighthouse");
	});

	it("renders emptyLine when no location entity", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const locSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Location",
		);
		expect(locSection?.querySelector(".sf-emptyline")).not.toBeNull();
	});

	it("renders unresolvedEl for unresolved location entity", () => {
		const ghostFile = createMockTFile({ basename: "Unknown Place", path: "Unknown Place" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "location", unresolved: true },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const locSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Location",
		);
		expect(locSection?.querySelector(".sf-unres")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Plotlines section
// ---------------------------------------------------------------------------

describe("renderScene: Plotlines section (S39)", () => {
	it("renders a 'Plotlines' section with a count badge", () => {
		const plotFile = createMockTFile({ basename: "The Dying Light" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: plotFile, kind: "plotline", relation: "outgoing", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Plotlines")).toBe(true);

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const plotHead = sectHeads.find((h) => h.textContent?.includes("Plotlines"));
		expect(plotHead?.querySelector(".sf-count")?.textContent).toBe("1");
	});

	it("renders link rows for each plotlines entity", () => {
		const plotFile = createMockTFile({ basename: "The Dying Light" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: plotFile, kind: "plotline", relation: "outgoing", field: "plotlines" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const plotSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Plotlines",
		);
		const linkTexts = [...(plotSection?.querySelectorAll(".sf-lrow-lnk") ?? [])].map((l) => l.textContent);
		expect(linkTexts).toContain("The Dying Light");
	});

	it("renders count badge as 0 and emptyLine when no plotlines entities", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const plotHead = sectHeads.find((h) => h.textContent?.includes("Plotlines"));
		expect(plotHead?.querySelector(".sf-count")?.textContent).toBe("0");

		const plotSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Plotlines",
		);
		expect(plotSection?.querySelector(".sf-emptyline")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Reading order section
// ---------------------------------------------------------------------------

describe("renderScene: Reading order section (S39)", () => {
	it("renders a 'Reading order' section", () => {
		const ctx = makeSceneCtx();
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Reading order")).toBe(true);
	});

	it("renders link rows for prev and next when both present", () => {
		const prevFile = createMockTFile({ basename: "Scene 0 - Prologue" });
		const nextFile = createMockTFile({ basename: "Scene 2 - The Salty Gull" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: prevFile, kind: "scene", relation: "outgoing", field: "prev" },
				{ file: nextFile, kind: "scene", relation: "outgoing", field: "next" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 0 - Prologue");
		expect(linkTexts).toContain("Scene 2 - The Salty Gull");
	});

	it("renders an em-dash (—) for prev when no prev entity", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const readingSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Reading order",
		);
		expect(readingSection?.textContent).toContain("—");
	});

	it("renders an em-dash (—) for next when no next entity", () => {
		const ctx = makeSceneCtx({ entities: [] });
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const readingSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Reading order",
		);
		// Both prev and next should have em-dash
		const emDashCount = (readingSection?.textContent?.match(/—/g) ?? []).length;
		expect(emDashCount).toBeGreaterThanOrEqual(2);
	});

	it("renders link row for next when next entity present but prev absent", () => {
		const nextFile = createMockTFile({ basename: "Scene 2 - The Salty Gull" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: nextFile, kind: "scene", relation: "outgoing", field: "next" },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const readingSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Reading order",
		);
		const linkTexts = [...(readingSection?.querySelectorAll(".sf-lrow-lnk") ?? [])].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 2 - The Salty Gull");
		// prev still gets em-dash
		expect(readingSection?.textContent).toContain("—");
	});

	it("renders unresolvedEl for unresolved prev entity", () => {
		const ghostFile = createMockTFile({ basename: "Ghost Scene", path: "Ghost Scene" });
		const ctx = makeSceneCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "prev", unresolved: true },
			],
		});
		const el = makeContainer();
		renderScene(ctx, el, makeDeps());

		const readingSection = [...el.querySelectorAll(".sf-section")].find((s) =>
			s.querySelector(".sf-sec-label")?.textContent === "Reading order",
		);
		expect(readingSection?.querySelector(".sf-unres")).not.toBeNull();
	});
});
