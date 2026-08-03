/**
 * heroCard.test.ts — T4.3 (spec 008-codex-surface, Phase 4).
 *
 * Hero is the registry default (T4.2) and the Card both signed-off figures
 * draw (S91, S97). What must hold: image-or-monogram, name, key facts and
 * relation pills (PRD/F4 AC); an absent property gets the `.miss` treatment
 * with BOTH a visible label and a tooltip (never colour alone); a
 * present-but-blank property renders normally, without `.miss`; and an entry
 * carrying none of the card's expected fields still renders its name (S97's
 * case generalised to our own Card, not just an imported one).
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91, S97, S104
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { describe, expect, it } from "vitest";
// Side-effect import: the obsidian mock sets globalThis.activeDocument, which
// panel/components.ts's portraitTile/kindTileEl (used by heroCard) rely on.
import "../../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderDeps } from "codex/cardRegistry";
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
		...overrides,
	};
}

function render(entry: CardEntry, depsOverrides?: Partial<CardRenderDeps>): HTMLElement {
	const el = document.createElement("div");
	heroCard.render(entry, el, getDeps(depsOverrides));
	return el;
}

function factLabels(el: HTMLElement): (string | null)[] {
	return Array.from(el.querySelectorAll(".sf-cx-hero-facts .sf-cx-fact b")).map((b) => b.textContent);
}

function factValues(el: HTMLElement): (string | null)[] {
	return Array.from(el.querySelectorAll(".sf-cx-hero-facts .sf-cx-fact-v")).map((v) => v.textContent);
}

describe("heroCard [PRD/F4]", () => {
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

	it("shows key facts for a classified kind, labelled and valued", () => {
		const el = render(
			getEntry({
				tags: ["canon/character"],
				role: "Protagonist",
				status: "Alive",
				occupation: "Harbour warden",
			}),
		);

		expect(factLabels(el)).toEqual(["role", "status", "occupation"]);
		expect(factValues(el)).toEqual(["Protagonist", "Alive", "Harbour warden"]);
	});

	it("shows relation pills, one per linked entity", () => {
		const el = render(
			getEntry({ tags: ["canon/character"], allies: ["[[Tobias Ferro]]", "[[Elke Stoneway]]"] }),
		);

		const pills = Array.from(el.querySelectorAll(".sf-cx-hero-pills .sf-cx-pill")).map((p) => p.textContent);
		expect(pills).toEqual(["[[Tobias Ferro]]", "[[Elke Stoneway]]"]);
	});

	it("renders an empty-but-present relation as no pills at all (blank is not absent)", () => {
		const el = render(getEntry({ tags: ["canon/character"], allies: [] }));

		const pillsRow = el.querySelector(".sf-cx-hero-pills");
		// allies is present (empty list): no pill for it, and — unlike an absent
		// relation — no .miss badge either.
		expect(pillsRow?.querySelectorAll(".sf-cx-pill").length).toBe(0);
		const missLabels = Array.from(pillsRow?.querySelectorAll(".sf-cx-miss b") ?? []).map((b) => b.textContent);
		expect(missLabels).not.toContain("allies");
	});

	it("marks an absent fact with a visible label AND a tooltip, never colour alone", () => {
		const el = render(getEntry({ tags: ["canon/character"], role: "Protagonist", status: "Alive" }));

		const miss = el.querySelector(".sf-cx-hero-facts .sf-cx-miss");
		expect(miss).not.toBeNull();
		expect(miss?.querySelector("b")?.textContent).toBe("occupation");
		expect(miss?.querySelector("i")?.textContent).toBe("not set");
		expect(miss?.getAttribute("title")).toBe("This property does not exist in this note");
	});

	it("marks an absent relation the same way, as a single miss badge for that relation", () => {
		const el = render(getEntry({ tags: ["canon/character"] }));

		const pillsRow = el.querySelector(".sf-cx-hero-pills");
		const alliesMiss = Array.from(pillsRow?.querySelectorAll(".sf-cx-miss") ?? []).find(
			(m) => m.querySelector("b")?.textContent === "allies",
		);
		expect(alliesMiss).toBeTruthy();
	});

	it("renders a present-but-blank fact normally, without .miss", () => {
		const el = render(
			getEntry({ tags: ["canon/character"], role: "Protagonist", status: "", occupation: "" }),
		);

		expect(el.querySelector(".sf-cx-hero-facts .sf-cx-miss")).toBeNull();
		expect(factLabels(el)).toEqual(["role", "status", "occupation"]);
		expect(factValues(el)).toEqual(["Protagonist", "", ""]);
	});

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

	it("degrades to image + name (no facts, no misses) for a kind none of the built-in collections classify", () => {
		const el = render(getEntry({ tags: ["canon/creature"] }));

		expect(el.querySelector(".sf-cx-fact")).toBeNull();
		expect(el.querySelector(".sf-cx-miss")).toBeNull();
		expect(el.textContent).toContain("Mara Stoneway");
	});

	it("omits the relation-pills row in compact (Workbench) density", () => {
		const el = render(getEntry({ tags: ["canon/character"], allies: ["[[Tobias Ferro]]"] }), {
			compact: true,
		});

		expect(el.querySelector(".sf-cx-hero-pills")).toBeNull();
		// The facts row still renders in compact form.
		expect(el.querySelector(".sf-cx-hero-facts")).not.toBeNull();
	});
});
