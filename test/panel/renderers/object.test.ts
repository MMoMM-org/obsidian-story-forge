/**
 * T3.3 — Object panel renderer tests (RED phase).
 *
 * Tests renderObject() against the DOM as the source of truth.
 * Mockup states exercised: S37.
 *
 * Sections (in order):
 *   image tile  — present only when frontmatter.image is set
 *   Facts       — kind/aliases/first_appearance; absent fields skipped
 *   Owner       — single entity where field==="owner"; empty → "Unowned."
 *   Appears in  — backlinks where kind==="scene" (incl. fuzzy:true); empty → emptyLine
 *
 * @ref mockups.html S37
 * @ref SDD/ADR-8 (fuzzy backlinks included for object "appears in")
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderObject } from "panel/renderers/object";
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

function makeObjCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "30 Canon/35 Objects/The Beacon Lens.md",
		basename: "The Beacon Lens",
	});
	return {
		activeFile,
		activeKind: "object",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Image tile
// ---------------------------------------------------------------------------

describe("renderObject: image tile", () => {
	it("renders an image tile when frontmatter.image is set", () => {
		const ctx = makeObjCtx({ frontmatter: { image: "imgs/beacon-lens.png" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const tile = el.querySelector(".sf-imgtile");
		expect(tile).not.toBeNull();
	});

	it("renders an img element with the image src when image is set", () => {
		const ctx = makeObjCtx({ frontmatter: { image: "imgs/beacon-lens.png" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const img = el.querySelector(".sf-imgtile img") as HTMLImageElement | null;
		expect(img?.src).toContain("beacon-lens.png");
	});

	it("does NOT render an image tile when frontmatter.image is absent", () => {
		const ctx = makeObjCtx({ frontmatter: {} });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const tile = el.querySelector(".sf-imgtile");
		expect(tile).toBeNull();
	});

	it("does NOT render an image tile when frontmatter.image is empty string", () => {
		const ctx = makeObjCtx({ frontmatter: { image: "" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const tile = el.querySelector(".sf-imgtile");
		expect(tile).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Facts section
// ---------------------------------------------------------------------------

describe("renderObject: Facts section (S37)", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makeObjCtx({ frontmatter: { kind: "artifact" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields are present", () => {
		const ctx = makeObjCtx({ frontmatter: {} });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for 'kind' when present", () => {
		const ctx = makeObjCtx({ frontmatter: { kind: "artifact" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("kind");
	});

	it("renders factRow value for 'kind'", () => {
		const ctx = makeObjCtx({ frontmatter: { kind: "artifact" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("artifact");
	});

	it("renders factRow for aliases when present", () => {
		const ctx = makeObjCtx({ frontmatter: { aliases: ["the lens"] } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("aliases");
	});

	it("joins array aliases with ', '", () => {
		const ctx = makeObjCtx({ frontmatter: { aliases: ["the lens", "the light"] } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("the lens, the light");
	});

	it("skips absent fact fields", () => {
		const ctx = makeObjCtx({ frontmatter: { kind: "relic" } });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("aliases");
		expect(keys).not.toContain("first_appearance");
	});
});

// ---------------------------------------------------------------------------
// Owner section
// ---------------------------------------------------------------------------

describe("renderObject: Owner section (S37)", () => {
	it("renders an Owner section", () => {
		const ctx = makeObjCtx();
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Owner")).toBe(true);
	});

	it("renders a link row for the owner entity when present", () => {
		const ownerFile = createMockTFile({ basename: "Tobias Ferro" });
		const ctx = makeObjCtx({
			entities: [
				{ file: ownerFile, kind: "character", relation: "outgoing", field: "owner" },
			],
		});
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Tobias Ferro");
	});

	it("shows 'Unowned.' when no owner entity exists", () => {
		const ctx = makeObjCtx({ entities: [] });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		expect(el.textContent).toContain("Unowned.");
	});
});

// ---------------------------------------------------------------------------
// Appears in section (ADR-8: includes fuzzy backlinks)
// ---------------------------------------------------------------------------

describe("renderObject: Appears in section (S37)", () => {
	it("renders an 'Appears in' section", () => {
		const ctx = makeObjCtx();
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Appears in")).toBe(true);
	});

	it("renders link rows for scene backlinks", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makeObjCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "location" },
			],
		});
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 1 - The Extinguished Fire");
	});

	it("includes fuzzy:true scene backlinks (ADR-8)", () => {
		const sceneFile = createMockTFile({ basename: "Scene 2 - Fuzzy Match" });
		const ctx = makeObjCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "location", fuzzy: true },
			],
		});
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 2 - Fuzzy Match");
	});

	it("shows a count badge with scene count", () => {
		const scene1 = createMockTFile({ basename: "Scene 1" });
		const scene2 = createMockTFile({ basename: "Scene 2" });
		const ctx = makeObjCtx({
			backlinks: [
				{ file: scene1, kind: "scene", relation: "backlink", field: "location" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "location", fuzzy: true },
			],
		});
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const appearsHead = sectHeads.find((h) => h.textContent?.includes("Appears in"));
		expect(appearsHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("shows 'No scenes yet.' when no scene backlinks", () => {
		const ctx = makeObjCtx({ backlinks: [] });
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes yet.");
	});

	it("excludes non-scene backlinks from Appears in", () => {
		const charFile = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeObjCtx({
			backlinks: [
				{ file: charFile, kind: "character", relation: "backlink", field: "owner" },
			],
		});
		const el = makeContainer();
		renderObject(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes yet.");
	});
});
