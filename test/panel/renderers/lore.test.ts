/**
 * T3.3 — Lore panel renderer tests (RED phase).
 *
 * Tests renderLore() against the DOM as the source of truth.
 * Mockup states exercised: S38.
 *
 * Sections (in order):
 *   Facts         — scope/aliases/first_appearance; absent fields skipped
 *   Related       — entities where field==="related"; kind-tagged rows; empty → emptyLine
 *   Referenced by — backlinks (reverse related, incl. fuzzy); kind-tagged rows; empty → emptyLine
 *
 * @ref mockups.html S38
 * @ref SDD/ADR-8 (fuzzy backlinks included for lore "referenced by")
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderLore } from "panel/renderers/lore";
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
		resolveAsset: (src: string) => src,
		...overrides,
	};
}

function makeLoreCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "30 Canon/36 Lore/The Moonfire.md",
		basename: "The Moonfire",
	});
	return {
		activeFile,
		activeKind: "lore",
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

describe("renderLore: Facts section (S38)", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makeLoreCtx({ frontmatter: { scope: "world rule" } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields are present", () => {
		const ctx = makeLoreCtx({ frontmatter: {} });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for scope when present", () => {
		const ctx = makeLoreCtx({ frontmatter: { scope: "world rule" } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("scope");
	});

	it("renders factRow value for scope", () => {
		const ctx = makeLoreCtx({ frontmatter: { scope: "world rule" } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("world rule");
	});

	it("renders factRow for aliases when present", () => {
		const ctx = makeLoreCtx({ frontmatter: { aliases: ["Moonfire"] } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("aliases");
	});

	it("joins array aliases with ', '", () => {
		const ctx = makeLoreCtx({ frontmatter: { aliases: ["Moonfire", "The Light"] } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("Moonfire, The Light");
	});

	it("skips absent fact fields", () => {
		const ctx = makeLoreCtx({ frontmatter: { scope: "faction" } });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("aliases");
		expect(keys).not.toContain("first_appearance");
	});
});

// ---------------------------------------------------------------------------
// Related section (outgoing entities where field==="related", kind-tagged rows)
// ---------------------------------------------------------------------------

describe("renderLore: Related section (S38)", () => {
	it("renders a Related section", () => {
		const ctx = makeLoreCtx();
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Related")).toBe(true);
	});

	it("renders link rows for related entities", () => {
		const objFile = createMockTFile({ basename: "The Beacon Lens" });
		const ctx = makeLoreCtx({
			entities: [
				{ file: objFile, kind: "object", relation: "outgoing", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("The Beacon Lens");
	});

	it("renders a trailing kind tag on each related row", () => {
		const objFile = createMockTFile({ basename: "The Beacon Lens" });
		const ctx = makeLoreCtx({
			entities: [
				{ file: objFile, kind: "object", relation: "outgoing", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const tags = [...el.querySelectorAll(".sf-trail")].map((t) => t.textContent);
		expect(tags).toContain("object");
	});

	it("renders kind tags for mixed-kind related entities", () => {
		const objFile = createMockTFile({ basename: "The Beacon Lens" });
		const locFile = createMockTFile({ basename: "Moonharbor Lighthouse" });
		const ctx = makeLoreCtx({
			entities: [
				{ file: objFile, kind: "object", relation: "outgoing", field: "related" },
				{ file: locFile, kind: "location", relation: "outgoing", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const tags = [...el.querySelectorAll(".sf-trail")].map((t) => t.textContent);
		expect(tags).toContain("object");
		expect(tags).toContain("location");
	});

	it("shows a count badge with related entity count", () => {
		const obj1 = createMockTFile({ basename: "The Beacon Lens" });
		const obj2 = createMockTFile({ basename: "Shadow Lantern" });
		const loc1 = createMockTFile({ basename: "Moonharbor Lighthouse" });
		const ctx = makeLoreCtx({
			entities: [
				{ file: obj1, kind: "object", relation: "outgoing", field: "related" },
				{ file: loc1, kind: "location", relation: "outgoing", field: "related" },
				{ file: obj2, kind: "object", relation: "outgoing", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const relatedHead = sectHeads.find((h) => h.textContent?.includes("Related"));
		expect(relatedHead?.querySelector(".sf-count")?.textContent).toBe("3");
	});

	it("shows 'No related notes yet.' when no related entities", () => {
		const ctx = makeLoreCtx({ entities: [] });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		expect(el.textContent).toContain("No related notes yet.");
	});

	it("excludes non-related-field entities from the Related section", () => {
		const charFile = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeLoreCtx({
			entities: [
				{ file: charFile, kind: "character", relation: "outgoing", field: "inhabitants" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		expect(el.textContent).toContain("No related notes yet.");
	});
});

// ---------------------------------------------------------------------------
// Referenced by section (backlinks — reverse related; incl. fuzzy; kind-tagged)
// ---------------------------------------------------------------------------

describe("renderLore: Referenced by section (S38)", () => {
	it("renders a 'Referenced by' section", () => {
		const ctx = makeLoreCtx();
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Referenced by")).toBe(true);
	});

	it("renders link rows for backlinks", () => {
		const objFile = createMockTFile({ basename: "The Beacon Lens" });
		const ctx = makeLoreCtx({
			backlinks: [
				{ file: objFile, kind: "object", relation: "backlink", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("The Beacon Lens");
	});

	it("renders a trailing kind tag on each referenced-by row", () => {
		const objFile = createMockTFile({ basename: "The Beacon Lens" });
		const ctx = makeLoreCtx({
			backlinks: [
				{ file: objFile, kind: "object", relation: "backlink", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const tags = [...el.querySelectorAll(".sf-trail")].map((t) => t.textContent);
		expect(tags).toContain("object");
	});

	it("includes fuzzy:true backlinks (ADR-8)", () => {
		const sceneFile = createMockTFile({ basename: "Scene 3 - Fuzzy" });
		const ctx = makeLoreCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "related", fuzzy: true },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 3 - Fuzzy");
	});

	it("shows a count badge with referenced-by count", () => {
		const ref1 = createMockTFile({ basename: "The Beacon Lens" });
		const ref2 = createMockTFile({ basename: "Shadow Lantern" });
		const ctx = makeLoreCtx({
			backlinks: [
				{ file: ref1, kind: "object", relation: "backlink", field: "related" },
				{ file: ref2, kind: "object", relation: "backlink", field: "related" },
			],
		});
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const refHead = sectHeads.find((h) => h.textContent?.includes("Referenced by"));
		expect(refHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("shows 'Not referenced yet.' when no backlinks", () => {
		const ctx = makeLoreCtx({ backlinks: [] });
		const el = makeContainer();
		renderLore(ctx, el, makeDeps());

		expect(el.textContent).toContain("Not referenced yet.");
	});
});
