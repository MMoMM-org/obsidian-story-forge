/**
 * heroCard.test.ts — T4.3 (spec 008-codex-surface, Phase 4).
 *
 * Rebuilt to assert the SIGNED-OFF mockup structure exactly (S91, lines
 * 613-623/368-381), not a generalised reinterpretation of it: image tile,
 * `.sf-cx-name`, ONE middot-joined facts line (`.sf-cx-hero-facts` — the
 * first two facts, unlabelled plain text), and ONE flex-wrap pill row
 * (`.sf-cx-hero-pills` — the third fact folded in beside every relation).
 * The two rows must stay separate DOM elements — that is the load-bearing
 * structural fact this suite protects (see "keeps the facts line and the
 * pill row separate" below).
 *
 * Also covers: an absent property gets the `.miss` treatment (visible label
 * AND tooltip, never colour alone) in EITHER row; a present-but-blank
 * property renders normally, without `.miss`; an entry carrying none of the
 * card's expected fields still renders its name (S97); and classification
 * via frontmatter `type` (no tag) reaches the same rendering, proving the
 * unified `classifyEntityKind` actually lands in Card output.
 *
 * @ref docs/XDD/specs/008-codex-surface/mockups.html — S91, S97, S104
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { describe, expect, it } from "vitest";
// Side-effect import: the obsidian mock sets globalThis.activeDocument, which
// panel/components.ts's portraitTile/kindTileEl (used by heroCard) rely on.
import "../../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderDeps } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { heroCard } from "codex/cards/heroCard";

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";
const LOCATION_PATH = "30 Canon/32 Locations/Moonharbor.md";

function getEntry(frontmatter: Record<string, unknown>, path = PATH): CardEntry {
	return nativeCardEntry(path, frontmatter);
}

function getDeps(overrides?: Partial<CardRenderDeps>): CardRenderDeps {
	return {
		compact: false,
		nameEl: (entry: CardEntry): HTMLElement => {
			const node = document.createElement("span");
			node.className = "sf-cx-name";
			node.setAttribute("data-sf-link", entry.path);
			node.textContent = entry.name;
			return node;
		},
		resolveAsset: (raw: string): string => raw,
		tileField: nativeTileField,
		...overrides,
	};
}

function render(entry: CardEntry, depsOverrides?: Partial<CardRenderDeps>): HTMLElement {
	const el = document.createElement("div");
	heroCard.render(entry, el, getDeps(depsOverrides));
	return el;
}

function factsLine(el: HTMLElement): HTMLElement | null {
	return el.querySelector(".sf-cx-hero-facts");
}

function pillRow(el: HTMLElement): HTMLElement | null {
	return el.querySelector(".sf-cx-hero-pills");
}

describe("heroCard [PRD/F4] — S91 structure", () => {
	it("is registered under the id/label T4.2's registry resolves as its default", () => {
		expect(heroCard.id).toBe("hero");
		expect(heroCard.label).toBe("Hero");
	});

	it("shows the portrait image (resolved through deps.resolveAsset) when the note has one", () => {
		const el = render(getEntry({ tags: ["canon/character"], portrait: "95 Assets/mara.png" }), {
			resolveAsset: (raw): string => `app://vault/${raw}`,
		});

		expect(el.querySelector("img")?.getAttribute("src")).toBe("app://vault/95 Assets/mara.png");
	});

	it("falls back to a monogram when the portrait is absent", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")?.textContent).toBe("MS");
	});

	it("draws a location tile from the image field, not portrait", () => {
		const el = render(
			getEntry({ tags: ["canon/location"], image: "95 Assets/harbor.png" }, LOCATION_PATH),
		);

		expect(el.querySelector(".sf-imgtile--loc img")?.getAttribute("src")).toBe("95 Assets/harbor.png");
	});

	it("renders the name via the host's nameEl seam", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Mara Stoneway");
	});

	// -------------------------------------------------------------------------
	// The load-bearing structural fact: two SEPARATE rows
	// -------------------------------------------------------------------------

	it("keeps the facts line and the pill row as two separate elements (S91's .hf and .hp are distinct)", () => {
		const el = render(
			getEntry({
				tags: ["canon/character"],
				role: "Protagonist",
				status: "Alive",
				occupation: "Harbour warden",
			}),
		);

		const facts = factsLine(el);
		const pills = pillRow(el);
		expect(facts).not.toBeNull();
		expect(pills).not.toBeNull();
		expect(facts).not.toBe(pills);
		expect(facts?.contains(pills!)).toBe(false);
		expect(pills?.contains(facts!)).toBe(false);
		// Exactly one of each in the whole card, never merged into one container.
		expect(el.querySelectorAll(".sf-cx-hero-facts").length).toBe(1);
		expect(el.querySelectorAll(".sf-cx-hero-pills").length).toBe(1);

		// Content stays in its own row — the first two facts never leak into the
		// pill row, and the third fact never leaks into the facts line.
		expect(facts?.textContent).toContain("Protagonist");
		expect(facts?.textContent).not.toContain("Harbour warden");
		expect(pills?.textContent).toContain("Harbour warden");
		expect(pills?.textContent).not.toContain("Protagonist");
	});

	// -------------------------------------------------------------------------
	// .sf-cx-hero-facts — the middot-joined line (S91's .hf)
	// -------------------------------------------------------------------------

	it("joins the first two facts on one line, unlabelled, middot-separated — matching S91 exactly", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist", status: "Alive" }));

		const facts = factsLine(el);
		// No field-name label ("role"/"status") anywhere in the line — S91 shows
		// "protagonist · alive", never "role: protagonist".
		expect(facts?.querySelector("b")).toBeNull();
		expect(facts?.querySelectorAll(".sf-cx-hero-fact-v").length).toBe(2);
		expect(Array.from(facts?.querySelectorAll(".sf-cx-hero-fact-v") ?? []).map((v) => v.textContent)).toEqual([
			"Protagonist",
			"Alive",
		]);
		expect(facts?.querySelector(".sf-cx-hero-dot")?.textContent).toBe("·");
	});

	it("marks an absent core fact in the facts line with a visible label AND a tooltip", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist" })); // status absent

		const miss = factsLine(el)?.querySelector(".sf-cx-miss");
		expect(miss).not.toBeNull();
		expect(miss?.querySelector("b")?.textContent).toBe("status");
		expect(miss?.querySelector("i")?.textContent).toBe("Not set");
		expect(miss?.getAttribute("title")).toBe("This property does not exist in this note");
	});

	// Regression: the "not set" explanation used to live ONLY in `title`, on a
	// non-focusable <span> — unreachable to touch, keyboard and most
	// screen-reader users. `aria-label` must carry the same explanation, and
	// must still name WHICH field is missing (not just the bare explanation),
	// since aria-label replaces the accessible name computed from the visible
	// "status" + "not set" text rather than adding to it.
	it("carries the same explanation to assistive tech via aria-label, keeping the field name in it", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist" })); // status absent

		const miss = factsLine(el)?.querySelector(".sf-cx-miss");
		const ariaLabel = miss?.getAttribute("aria-label") ?? "";
		expect(ariaLabel).toMatch(/this property does not exist in this note/i);
		expect(ariaLabel).toContain("status");
	});

	it("renders a present-but-blank core fact normally in the facts line, without .miss", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist", status: "" }));

		const facts = factsLine(el);
		expect(facts?.querySelector(".sf-cx-miss")).toBeNull();
		expect(Array.from(facts?.querySelectorAll(".sf-cx-hero-fact-v") ?? []).map((v) => v.textContent)).toEqual([
			"Protagonist",
			"",
		]);
	});

	// -------------------------------------------------------------------------
	// .sf-cx-hero-pills — the flex-wrap pill row (S91's .hp): third fact + relations
	// -------------------------------------------------------------------------

	it("folds the third fact into the pill row as one pill, same slot as a relation", () => {
		const el = render(
			getEntry({
				tags: ["canon/character"],
				role: "Protagonist",
				status: "Alive",
				occupation: "Harbour warden",
			}),
		);

		const pills = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-relpill") ?? []).map((p) => p.textContent);
		expect(pills).toContain("Harbour warden");
	});

	it("shows relation pills, one per linked entity, in the same pill row", () => {
		const el = render(
			getEntry({ tags: ["canon/character"], allies: ["[[Tobias Ferro]]", "[[Elke Stoneway]]"] }),
		);

		const pills = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-relpill") ?? []).map((p) => p.textContent);
		expect(pills).toEqual(["Tobias Ferro", "Elke Stoneway"]);
	});

	it("renders an empty-but-present relation as no pills at all (blank is not absent)", () => {
		const el = render(getEntry({ tags: ["canon/character"], allies: [] }));

		const pills = pillRow(el);
		expect(pills?.querySelectorAll(".sf-cx-relpill").length).toBe(0);
		const missLabels = Array.from(pills?.querySelectorAll(".sf-cx-miss b") ?? []).map((b) => b.textContent);
		expect(missLabels).not.toContain("allies");
	});

	it("marks an absent third fact (occupation) in the pill row the same way as an absent relation", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist", status: "Alive" }));

		const miss = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-miss") ?? []).find(
			(m) => m.querySelector("b")?.textContent === "occupation",
		);
		expect(miss).toBeTruthy();
		expect(miss?.querySelector("i")?.textContent).toBe("Not set");
		expect(miss?.getAttribute("title")).toBe("This property does not exist in this note");
	});

	it("marks an absent relation in the pill row the same way", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		const alliesMiss = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-miss") ?? []).find(
			(m) => m.querySelector("b")?.textContent === "allies",
		);
		expect(alliesMiss).toBeTruthy();
	});

	it("renders a present-but-blank third fact normally — nothing shown, no .miss", () => {
		const el = render(
			getEntry({ tags: ["canon/character"], role: "Protagonist", status: "Alive", occupation: "" }),
		);

		const missLabels = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-miss b") ?? []).map((b) => b.textContent);
		expect(missLabels).not.toContain("occupation");
		const pillTexts = Array.from(pillRow(el)?.querySelectorAll(".sf-cx-relpill") ?? []).map((p) => p.textContent);
		expect(pillTexts).not.toContain("");
	});

	// -------------------------------------------------------------------------
	// Cross-cutting: undefined-safety, S97, unknown kind, compact, type fallback
	// -------------------------------------------------------------------------

	it("never puts the literal text 'undefined' in the DOM for an absent field", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		expect(el.textContent).not.toContain("undefined");
	});

	it("still renders the name when the entry carries none of the card's expected fields (S97)", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Mara Stoneway");
		// Every expected character fact/relation is absent — each is marked, not hidden.
		expect(el.querySelectorAll(".sf-cx-miss").length).toBeGreaterThan(0);
	});

	it("degrades to image + name — no facts line, no pill row — for a kind none of the built-in collections classify", () => {
		const el = render(getEntry({ tags: ["canon/creature"] }));

		expect(factsLine(el)).toBeNull();
		expect(pillRow(el)).toBeNull();
		expect(el.querySelector(".sf-cx-miss")).toBeNull();
		expect(el.textContent).toContain("Mara Stoneway");
	});

	it("omits the pill row in compact (Workbench) density, keeping the facts line", () => {
		const el = render(getEntry({ tags: ["canon/character"], allies: ["[[Tobias Ferro]]"] }), {
			compact: true,
		});

		expect(pillRow(el)).toBeNull();
		expect(factsLine(el)).not.toBeNull();
	});

	it("classifies via frontmatter `type` when no tag matches (parity with ScopingService.classify, ADR-4)", () => {
		// No "canon/*" tag at all — only classifiable through the `type`
		// fallback, exactly as `ScopingService.classify` already does for the
		// panel. Before the T4.3 review fix this note read as "unknown" here
		// (Card classification had no type-fallback) while ScopingService
		// correctly resolved "location" — the two classifiers disagreeing on
		// the same note.
		const el = render(getEntry({ type: "location", locationType: "harbour" }, LOCATION_PATH));

		expect(el.querySelector(".sf-imgtile--loc")).not.toBeNull();
		// location's facts are [locationType, region, aliases, first_appearance]:
		// the first two (locationType, region) go in the facts line; locationType
		// is present, region is not.
		const facts = factsLine(el);
		expect(facts?.querySelectorAll(".sf-cx-hero-fact-v")[0]?.textContent).toBe("harbour");
		expect(facts?.querySelector(".sf-cx-miss b")?.textContent).toBe("region");
	});
});
