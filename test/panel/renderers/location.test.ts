/**
 * T3.3 — Location panel renderer tests (RED phase).
 *
 * Tests renderLocation() against the DOM as the source of truth.
 * Mockup states exercised: S36.
 *
 * Sections (in order):
 *   image tile   — present only when frontmatter.image is set
 *   Facts        — locationType/region/aliases/first_appearance; absent fields skipped
 *   Within       — breadcrumb from entities where field==="world"; omitted when none
 *   Inhabitants  — entities where field==="inhabitants"; count badge; empty → emptyLine
 *   Scenes here  — backlinks where kind==="scene" && field==="location"; empty → emptyLine
 *   Child locations (optional) — backlinks where kind==="location" && field==="world"
 *
 * @ref mockups.html S36
 * @ref SDD/ADR-7 (location renderer), ADR-8 (fuzzy backlinks), DV-2 (breadcrumb depth)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderLocation } from "panel/renderers/location";
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

function makeLocCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "30 Canon/33 Locations/Moonharbor Lighthouse.md",
		basename: "Moonharbor Lighthouse",
	});
	return {
		activeFile,
		activeKind: "location",
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

describe("renderLocation: profile tile (D5 kind-glyph placeholder)", () => {
	it("renders an image tile inside a profile when frontmatter.image is set", () => {
		const ctx = makeLocCtx({ frontmatter: { image: "imgs/lighthouse.png" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const profile = el.querySelector(".sf-profile");
		expect(profile).not.toBeNull();
		const tile = profile?.querySelector(".sf-imgtile");
		expect(tile).not.toBeNull();
	});

	it("renders an img element with the image src when image is set", () => {
		const ctx = makeLocCtx({ frontmatter: { image: "imgs/lighthouse.png" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const img = el.querySelector(".sf-imgtile img") as HTMLImageElement | null;
		expect(img?.src).toContain("lighthouse.png");
	});

	it("renders a kind-glyph placeholder tile (🏛, --loc variant) when image is absent (D5)", () => {
		const ctx = makeLocCtx({ frontmatter: {} });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const tile = el.querySelector(".sf-imgtile");
		expect(tile).not.toBeNull();
		expect(tile?.classList.contains("sf-imgtile--loc")).toBe(true);
		expect(tile?.querySelector(".sf-imgtile-glyph")?.textContent).toBe("🏛");
	});

	it("renders the placeholder tile when image is empty string (D5)", () => {
		const ctx = makeLocCtx({ frontmatter: { image: "" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const tile = el.querySelector(".sf-imgtile");
		expect(tile).not.toBeNull();
		expect(tile?.querySelector(".sf-imgtile-glyph")).not.toBeNull();
	});

	it("renders pinfo lead line 'locationType · region'", () => {
		const ctx = makeLocCtx({
			frontmatter: { locationType: "building", region: "harbour mole" },
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const lead = el.querySelector(".sf-pinfo-line.sf-lead");
		expect(lead?.textContent).toBe("building · harbour mole");
	});

	it("renders a second pinfo line from aliases", () => {
		const ctx = makeLocCtx({
			frontmatter: { locationType: "building", aliases: ["the lighthouse"] },
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const lines = [...el.querySelectorAll(".sf-pinfo-line")].map((l) => l.textContent);
		expect(lines).toContain("the lighthouse");
	});
});

// ---------------------------------------------------------------------------
// Facts section
// ---------------------------------------------------------------------------

describe("renderLocation: Facts section (S36)", () => {
	it("renders a Facts section when any fact field is present", () => {
		const ctx = makeLocCtx({ frontmatter: { locationType: "building" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("omits Facts section when no fact fields are present", () => {
		const ctx = makeLocCtx({ frontmatter: {} });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Facts")).toBe(true);
	});

	it("renders factRow for locationType with the humanized label 'type'", () => {
		const ctx = makeLocCtx({ frontmatter: { locationType: "building" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("type"); // humanized locationType (fix #4)
		expect(keys).not.toContain("locationType");
	});

	it("renders factRow for region when present", () => {
		const ctx = makeLocCtx({ frontmatter: { region: "harbour mole" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("region");
	});

	it("renders factRow for aliases when present", () => {
		const ctx = makeLocCtx({ frontmatter: { aliases: ["the lighthouse"] } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("the lighthouse");
	});

	it("joins array aliases with ', '", () => {
		const ctx = makeLocCtx({ frontmatter: { aliases: ["the lighthouse", "Ferro's Watch"] } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("the lighthouse, Ferro's Watch");
	});

	it("skips fact fields that are absent from frontmatter", () => {
		const ctx = makeLocCtx({ frontmatter: { locationType: "town" } });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("region");
		expect(keys).not.toContain("aliases");
	});
});

// ---------------------------------------------------------------------------
// Within section (DV-2: single-level breadcrumb from entities[field==="world"])
// ---------------------------------------------------------------------------

describe("renderLocation: Within section (S36)", () => {
	it("renders a Within section when a world-field entity exists", () => {
		const parentFile = createMockTFile({ basename: "Moonharbor" });
		const ctx = makeLocCtx({
			entities: [
				{ file: parentFile, kind: "location", relation: "outgoing", field: "world" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Within")).toBe(true);
	});

	it("omits the Within section when no world-field entity exists (top-level location)", () => {
		const ctx = makeLocCtx({ entities: [] });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Within")).toBe(true);
	});

	it("renders breadcrumb with parent basename text", () => {
		const parentFile = createMockTFile({ basename: "Moonharbor" });
		const ctx = makeLocCtx({
			entities: [
				{ file: parentFile, kind: "location", relation: "outgoing", field: "world" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		expect(el.textContent).toContain("Moonharbor");
	});

	it("renders current note basename as the leaf of the breadcrumb", () => {
		const parentFile = createMockTFile({ basename: "Moonharbor" });
		const ctx = makeLocCtx({
			entities: [
				{ file: parentFile, kind: "location", relation: "outgoing", field: "world" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		expect(el.textContent).toContain("Moonharbor Lighthouse");
	});

	it("renders an unresolvedEl when the world-field entity is unresolved", () => {
		const ghostFile = createMockTFile({ basename: "Unknown World", path: "Unknown World" });
		const ctx = makeLocCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "world", unresolved: true },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const unres = el.querySelector(".sf-unres");
		expect(unres).not.toBeNull();
		expect(unres?.textContent).toContain("Unknown World");
	});
});

// ---------------------------------------------------------------------------
// Inhabitants section
// ---------------------------------------------------------------------------

describe("renderLocation: Inhabitants section", () => {
	it("renders an Inhabitants section", () => {
		const ctx = makeLocCtx();
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Inhabitants")).toBe(true);
	});

	it("renders link rows for inhabitants entities", () => {
		const charFile = createMockTFile({ basename: "Tobias Ferro" });
		const ctx = makeLocCtx({
			entities: [
				{ file: charFile, kind: "character", relation: "outgoing", field: "inhabitants" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Tobias Ferro");
	});

	it("shows a count badge with inhabitant count", () => {
		const char1 = createMockTFile({ basename: "Tobias Ferro" });
		const char2 = createMockTFile({ basename: "Mara Stoneway" });
		const ctx = makeLocCtx({
			entities: [
				{ file: char1, kind: "character", relation: "outgoing", field: "inhabitants" },
				{ file: char2, kind: "character", relation: "outgoing", field: "inhabitants" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const inhabHead = sectHeads.find((h) => h.textContent?.includes("Inhabitants"));
		expect(inhabHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("shows 'No inhabitants yet.' when no inhabitants entities", () => {
		const ctx = makeLocCtx({ entities: [] });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		expect(el.textContent).toContain("No inhabitants yet.");
	});
});

// ---------------------------------------------------------------------------
// Scenes here section
// ---------------------------------------------------------------------------

describe("renderLocation: Scenes here section", () => {
	it("renders a 'Scenes here' section", () => {
		const ctx = makeLocCtx();
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Scenes here")).toBe(true);
	});

	it("renders link rows for scene backlinks with field==='location'", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makeLocCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "location" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 1 - The Extinguished Fire");
	});

	it("shows a count badge with scenes-here count", () => {
		const scene1 = createMockTFile({ basename: "Scene 1" });
		const scene2 = createMockTFile({ basename: "Scene 2" });
		const ctx = makeLocCtx({
			backlinks: [
				{ file: scene1, kind: "scene", relation: "backlink", field: "location" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "location" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const scenesHead = sectHeads.find((h) => h.textContent?.includes("Scenes here"));
		expect(scenesHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});

	it("shows 'No scenes here yet.' when no scene backlinks", () => {
		const ctx = makeLocCtx({ backlinks: [] });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes here yet.");
	});

	it("excludes non-location-field scene backlinks from Scenes here", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1" });
		const ctx = makeLocCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "characters" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes here yet.");
	});
});

// ---------------------------------------------------------------------------
// Locations section (optional: child-location backlinks where kind==="location" && field==="world")
// ---------------------------------------------------------------------------

describe("renderLocation: Locations section (child locations)", () => {
	it("renders a 'Locations' section with child location backlinks when present", () => {
		const childFile = createMockTFile({ basename: "Moonharbor Lighthouse" });
		const ctx = makeLocCtx({
			backlinks: [
				{ file: childFile, kind: "location", relation: "backlink", field: "world" },
			],
		});
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Locations")).toBe(true);

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Moonharbor Lighthouse");
	});

	it("omits the Locations section when no child-location backlinks exist", () => {
		const ctx = makeLocCtx({ backlinks: [] });
		const el = makeContainer();
		renderLocation(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Locations")).toBe(true);
	});
});
