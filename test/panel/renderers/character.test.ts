/**
 * T3.2 — Character panel renderer tests (RED phase).
 *
 * Tests renderCharacter() against the DOM as the source of truth.
 * Mockup states exercised:
 *   S32 — populated character (portrait, facts, relationships, appears-in, owns, related)
 *   S33 — empty relations (each section shows per-section empty-state copy)
 *   S34 — unresolved relation link (unresolvedRow rendered)
 *   S35 — missing portrait (monogram tile via portraitTile)
 *
 * Fantasy sub-block (ADR-9):
 *   - present when fantasy fields exist in frontmatter
 *   - absent when none of the fantasy fields are in frontmatter
 *
 * All assertions are behavioural — class names + textContent, not internals.
 *
 * @ref mockups.html S32–S35
 * @ref SDD/ADR-9 (conditional fantasy sub-block)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import { renderCharacter } from "panel/renderers/character";
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

/**
 * Build a NoteContext for a character note.
 * Defaults: no outgoing entities, no backlinks, empty frontmatter.
 */
function makeCharCtx(overrides?: Partial<NoteContext>): NoteContext {
	const activeFile = createMockTFile({
		path: "30 Canon/31 Characters/Mara Stoneway.md",
		basename: "Mara Stoneway",
	});
	return {
		activeFile,
		activeKind: "character",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// S35 — Portrait tile (monogram when portrait absent)
// ---------------------------------------------------------------------------

describe("renderCharacter: portrait tile (S35)", () => {
	it("renders a portrait tile element", () => {
		const ctx = makeCharCtx();
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const portrait = el.querySelector(".sf-portrait");
		expect(portrait).not.toBeNull();
	});

	it("shows monogram initials when portrait frontmatter is absent/empty", () => {
		const ctx = makeCharCtx({
			frontmatter: { portrait: "" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const mono = el.querySelector(".sf-portrait-mono");
		expect(mono).not.toBeNull();
		expect(mono?.textContent).toBe("MS"); // Mara Stoneway
	});

	it("monogram uses the file basename for initials when name field absent", () => {
		const ctx = makeCharCtx({ frontmatter: {} });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const mono = el.querySelector(".sf-portrait-mono");
		expect(mono?.textContent).toBe("MS");
	});
});

// ---------------------------------------------------------------------------
// S32 — Profile block (portrait + pinfo stat lines + tagline)
// ---------------------------------------------------------------------------

describe("renderCharacter: profile block (S32)", () => {
	it("renders a sf-profile wrapping the portrait tile", () => {
		const ctx = makeCharCtx({ frontmatter: { role: "protagonist" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const profile = el.querySelector(".sf-profile");
		expect(profile).not.toBeNull();
		expect(profile?.querySelector(".sf-portrait")).not.toBeNull();
		expect(profile?.querySelector(".sf-pinfo")).not.toBeNull();
	});

	it("lead line bolds the nickname and shows role after a middot", () => {
		const ctx = makeCharCtx({
			frontmatter: { nickname: "Spark", role: "protagonist" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const lead = el.querySelector(".sf-pinfo-line.sf-lead");
		expect(lead?.querySelector("b")?.textContent).toBe("Spark");
		expect(lead?.textContent).toBe("Spark · protagonist");
	});

	it("lead line is just the role when no nickname is present", () => {
		const ctx = makeCharCtx({ frontmatter: { role: "minor" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const lead = el.querySelector(".sf-pinfo-line.sf-lead");
		expect(lead?.textContent).toBe("minor");
		expect(lead?.querySelector("b")).toBeNull();
	});

	it("composes occupation · age line, omitting empty fields", () => {
		const ctx = makeCharCtx({
			frontmatter: { role: "protagonist", occupation: "lighthouse apprentice", age: 19 },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const lines = [...el.querySelectorAll(".sf-pinfo-line")].map((l) => l.textContent);
		expect(lines).toContain("lighthouse apprentice · age 19");
	});

	it("composes status · height cm · build line", () => {
		const ctx = makeCharCtx({
			frontmatter: { role: "protagonist", status: "alive", height: 168, build: "slim, wiry" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const lines = [...el.querySelectorAll(".sf-pinfo-line")].map((l) => l.textContent);
		expect(lines).toContain("alive · 168 cm · slim, wiry");
	});

	it("composes eyes · hair line", () => {
		const ctx = makeCharCtx({
			frontmatter: { role: "protagonist", eyes: "hazel", hair: "copper-red, short" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const lines = [...el.querySelectorAll(".sf-pinfo-line")].map((l) => l.textContent);
		expect(lines).toContain("hazel eyes · copper-red, short");
	});

	it("renders a tagline (quoted) when frontmatter.tagline is set", () => {
		const ctx = makeCharCtx({
			frontmatter: {
				role: "protagonist",
				tagline: "A lighthouse apprentice hunts the thief of the harbour light.",
			},
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const tagline = el.querySelector(".sf-ptagline");
		expect(tagline?.textContent).toBe(
			'"A lighthouse apprentice hunts the thief of the harbour light."',
		);
	});

	it("omits the tagline element when frontmatter.tagline is empty/absent", () => {
		const ctx = makeCharCtx({ frontmatter: { role: "protagonist" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		expect(el.querySelector(".sf-ptagline")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// S32 — Facts section
// ---------------------------------------------------------------------------

describe("renderCharacter: Facts section (S32)", () => {
	it("renders a Facts section", () => {
		const ctx = makeCharCtx({ frontmatter: { aliases: "Mara" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Facts")).toBe(true);
	});

	it("renders a factRow for each present Facts-section field with humanized labels", () => {
		// age/status now live in the profile block (S32); the Facts section keeps
		// aliases, features (distinctive_features), first seen (first_appearance).
		const ctx = makeCharCtx({
			frontmatter: {
				aliases: "Mara",
				distinctive_features: "freckles across nose",
			},
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("aliases");
		expect(keys).toContain("features"); // humanized distinctive_features
		expect(keys).not.toContain("distinctive_features");
	});

	it("shows age/status in the profile block, not the Facts section", () => {
		const ctx = makeCharCtx({
			frontmatter: { aliases: "Mara", age: 19, status: "alive", role: "protagonist" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("age");
		expect(keys).not.toContain("status");
		// They appear in pinfo lines instead.
		const pinfo = el.querySelector(".sf-pinfo")?.textContent ?? "";
		expect(pinfo).toContain("age 19");
		expect(pinfo).toContain("alive");
	});

	it("skips absent fact fields (no factRow for undefined keys)", () => {
		const ctx = makeCharCtx({ frontmatter: { aliases: "Mara" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		// Only aliases present; occupation absent → no row for it
		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).not.toContain("occupation");
	});

	it("shows fact values as text content in value span", () => {
		const ctx = makeCharCtx({ frontmatter: { aliases: "Mara" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("Mara");
	});

	it("joins array fact values with ', ' (not the raw Array.toString comma)", () => {
		const ctx = makeCharCtx({ frontmatter: { aliases: ["Mara", "Storm"] } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const vals = [...el.querySelectorAll(".sf-frow-v")].map((v) => v.textContent);
		expect(vals).toContain("Mara, Storm");
		expect(vals).not.toContain("Mara,Storm");
	});
});

// ---------------------------------------------------------------------------
// S32 — Relationships section
// ---------------------------------------------------------------------------

describe("renderCharacter: Relationships section (S32)", () => {
	it("renders a Relationships section", () => {
		const ctx = makeCharCtx({ frontmatter: {} });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Relationships")).toBe(true);
	});

	it("renders a relation row for each outgoing relation field present in entities", () => {
		const partnerFile = createMockTFile({ basename: "Jonas Kell" });
		const ctx = makeCharCtx({
			entities: [
				{ file: partnerFile, kind: "character", relation: "outgoing", field: "significant_other" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		// The label for significant_other → "partner"
		const labels = [...el.querySelectorAll(".sf-rel-k")].map((k) => k.textContent);
		expect(labels).toContain("partner");
	});

	it("labels significant_other as 'partner'", () => {
		const partnerFile = createMockTFile({ basename: "Jonas Kell" });
		const ctx = makeCharCtx({
			entities: [
				{ file: partnerFile, kind: "character", relation: "outgoing", field: "significant_other" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-rel-k")].map((k) => k.textContent);
		expect(labels).toContain("partner");
		expect(labels).not.toContain("significant_other");
	});

	it("renders link text as the entity basename in each relation row", () => {
		const partnerFile = createMockTFile({ basename: "Jonas Kell" });
		const ctx = makeCharCtx({
			entities: [
				{ file: partnerFile, kind: "character", relation: "outgoing", field: "significant_other" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Jonas Kell");
	});
});

// ---------------------------------------------------------------------------
// S33 — Empty relations
// ---------------------------------------------------------------------------

describe("renderCharacter: empty-state copy (S33)", () => {
	it("shows 'No relationships yet.' when no outgoing relation entities", () => {
		const ctx = makeCharCtx({ entities: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		expect(el.textContent).toContain("No relationships yet.");
	});

	it("shows 'No scenes yet.' when no scene backlinks", () => {
		const ctx = makeCharCtx({ backlinks: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		expect(el.textContent).toContain("No scenes yet.");
	});

	it("shows 'No related locations or lore yet.' when no location/lore backlinks", () => {
		const ctx = makeCharCtx({ backlinks: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		expect(el.textContent).toContain("No related locations or lore yet.");
	});
});

// ---------------------------------------------------------------------------
// S34 — Unresolved link
// ---------------------------------------------------------------------------

describe("renderCharacter: unresolved relation (S34)", () => {
	it("renders an unresolvedRow for an entity with unresolved:true", () => {
		const ghostFile = createMockTFile({ basename: "Old Keeper Oath", path: "Old Keeper Oath" });
		const ctx = makeCharCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "allies", unresolved: true },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const unresRows = el.querySelectorAll(".sf-unres");
		expect(unresRows.length).toBeGreaterThan(0);
	});

	it("unresolved row contains the link text", () => {
		const ghostFile = createMockTFile({ basename: "Old Keeper Oath", path: "Old Keeper Oath" });
		const ctx = makeCharCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "allies", unresolved: true },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const unresRow = el.querySelector(".sf-unres");
		expect(unresRow?.textContent).toContain("Old Keeper Oath");
	});

	it("unresolved row is aria-disabled", () => {
		const ghostFile = createMockTFile({ basename: "Ghost", path: "Ghost" });
		const ctx = makeCharCtx({
			entities: [
				{ file: ghostFile, kind: "unknown", relation: "outgoing", field: "enemies", unresolved: true },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const unresRow = el.querySelector(".sf-unres");
		expect(unresRow?.getAttribute("aria-disabled")).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// S32 — Appears in section (backlinks from scenes)
// ---------------------------------------------------------------------------

describe("renderCharacter: Appears in section (S32)", () => {
	it("renders an 'Appears in' section", () => {
		const ctx = makeCharCtx();
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Appears in")).toBe(true);
	});

	it("renders a link row for each scene backlink", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "characters" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Scene 1 - The Extinguished Fire");
	});

	it("tags pov backlinks with 'pov' trail tag", () => {
		const sceneFile = createMockTFile({ basename: "Scene 1 - The Extinguished Fire" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "pov" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const trail = el.querySelector(".sf-trail");
		expect(trail?.textContent).toBe("pov");
	});

	it("tags characters backlinks with 'char' trail tag", () => {
		const sceneFile = createMockTFile({ basename: "Scene 2" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: sceneFile, kind: "scene", relation: "backlink", field: "characters" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const trail = el.querySelector(".sf-trail");
		expect(trail?.textContent).toBe("char");
	});

	it("counts scene backlinks in the Appears-in section header badge", () => {
		const scene1 = createMockTFile({ basename: "Scene 1" });
		const scene2 = createMockTFile({ basename: "Scene 2" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: scene1, kind: "scene", relation: "backlink", field: "pov" },
				{ file: scene2, kind: "scene", relation: "backlink", field: "characters" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		// Find Appears in section header → look for count badge with "2"
		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const appearsHead = sectHeads.find((h) => h.textContent?.includes("Appears in"));
		expect(appearsHead?.querySelector(".sf-count")?.textContent).toBe("2");
	});
});

// ---------------------------------------------------------------------------
// S32 — Owns section (object backlinks)
// ---------------------------------------------------------------------------

describe("renderCharacter: Owns section (S32)", () => {
	it("renders an 'Owns' section", () => {
		const ctx = makeCharCtx();
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Owns")).toBe(true);
	});

	it("renders collapsed when no object backlinks (count 0)", () => {
		const ctx = makeCharCtx({ backlinks: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const sectHeads = [...el.querySelectorAll(".sf-sec-head")];
		const ownsHead = sectHeads.find((h) => h.textContent?.includes("Owns"));
		expect(ownsHead?.getAttribute("aria-expanded")).toBe("false");
	});

	it("renders 'No objects yet.' empty line in body when no object backlinks", () => {
		const ctx = makeCharCtx({ backlinks: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		// The body should contain the empty-state text even when the section is collapsed
		expect(el.textContent).toContain("No objects yet.");
	});

	it("renders a link row for each object backlink when present", () => {
		const objFile = createMockTFile({ basename: "Silver Compass" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: objFile, kind: "object", relation: "backlink", field: "owner" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const linkTexts = [...el.querySelectorAll(".sf-lrow-lnk")].map((l) => l.textContent);
		expect(linkTexts).toContain("Silver Compass");
	});
});

// ---------------------------------------------------------------------------
// S32 — Related section (location + lore backlinks)
// ---------------------------------------------------------------------------

describe("renderCharacter: Related section (S32)", () => {
	it("renders a 'Related' section", () => {
		const ctx = makeCharCtx();
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Related")).toBe(true);
	});

	it("groups location backlinks under 'locations' label", () => {
		const locFile = createMockTFile({ basename: "Moonharbor" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: locFile, kind: "location", relation: "backlink", field: "inhabitants" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const relLabels = [...el.querySelectorAll(".sf-rel-k")].map((k) => k.textContent);
		expect(relLabels).toContain("locations");
	});

	it("excludes location backlinks with field other than 'inhabitants' from Related", () => {
		// A location backlink via a non-inhabitants field (e.g. scene.location) must NOT
		// appear in the Related section — only inhabitants-field backlinks belong here.
		const locFile = createMockTFile({ basename: "Moonharbor Lighthouse" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: locFile, kind: "location", relation: "backlink", field: "location" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		// No 'locations' relation row should appear
		const relLabels = [...el.querySelectorAll(".sf-rel-k")].map((k) => k.textContent);
		expect(relLabels).not.toContain("locations");
		// The empty-state message should appear instead
		expect(el.textContent).toContain("No related locations or lore yet.");
	});

	it("groups lore backlinks under 'lore' label", () => {
		const loreFile = createMockTFile({ basename: "The Moonfire" });
		const ctx = makeCharCtx({
			backlinks: [
				{ file: loreFile, kind: "lore", relation: "backlink", field: "related" },
			],
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const relLabels = [...el.querySelectorAll(".sf-rel-k")].map((k) => k.textContent);
		expect(relLabels).toContain("lore");
	});

	it("shows 'No related locations or lore yet.' when no location/lore backlinks", () => {
		const ctx = makeCharCtx({ backlinks: [] });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		expect(el.textContent).toContain("No related locations or lore yet.");
	});
});

// ---------------------------------------------------------------------------
// resolveAsset — portrait path resolution
// ---------------------------------------------------------------------------

describe("renderCharacter: portrait resolution via deps.resolveAsset", () => {
	it("renders img.src as the resolved resource URL when portrait is a vault path", () => {
		const ctx = makeCharCtx({ frontmatter: { portrait: "95 Assets/Mara Stoneway.svg" } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps({
			resolveAsset: (src: string) =>
				src === "95 Assets/Mara Stoneway.svg" ? "app://vault/fake.svg" : src,
		}));

		const img = el.querySelector(".sf-portrait img") as HTMLImageElement | null;
		expect(img?.src).toBe("app://vault/fake.svg");
	});

	it("renders img.src as the raw external URL when portrait is an https URL (pass-through)", () => {
		const url = "https://example.com/portrait.png";
		const ctx = makeCharCtx({ frontmatter: { portrait: url } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps({
			resolveAsset: (src: string) => src,
		}));

		const img = el.querySelector(".sf-portrait img") as HTMLImageElement | null;
		expect(img?.src).toBe(url);
	});
});

// ---------------------------------------------------------------------------
// ADR-9 — Fantasy sub-block
// ---------------------------------------------------------------------------

describe("renderCharacter: Fantasy sub-block (ADR-9)", () => {
	it("renders a Fantasy facts block when fantasy fields are in frontmatter", () => {
		const ctx = makeCharCtx({
			frontmatter: { species: "Elf", magical_abilities: "Farsight" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.some((l) => l.textContent === "Fantasy")).toBe(true);
	});

	it("omits Fantasy block when no fantasy fields are in frontmatter", () => {
		const ctx = makeCharCtx({ frontmatter: { aliases: "Mara", age: 19 } });
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const labels = [...el.querySelectorAll(".sf-sec-label")];
		expect(labels.every((l) => l.textContent !== "Fantasy")).toBe(true);
	});

	it("renders factRows for fantasy fields present in frontmatter", () => {
		const ctx = makeCharCtx({
			frontmatter: { species: "Human", weapons: "Crossbow" },
		});
		const el = makeContainer();
		renderCharacter(ctx, el, makeDeps());

		const keys = [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent);
		expect(keys).toContain("species");
		expect(keys).toContain("weapons");
	});
});
