/**
 * tableCard.test.ts — T4.3 (spec 008-codex-surface, Phase 4).
 *
 * Table renders the SAME entries Hero does, at a denser, one-row-per-entry
 * layout: every fact and relation column for the entry's classified kind
 * (`panel/kindFields.ts` — the same lists the panel renderers use).
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { describe, expect, it } from "vitest";
// Side-effect import: the obsidian mock sets globalThis.activeDocument, which
// the Card modules rely on for DOM construction.
import "../../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderDeps } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { tableCard } from "codex/cards/tableCard";

const PATH = "30 Canon/32 Locations/Moonharbor.md";

function getDeps(): CardRenderDeps {
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
	};
}

function render(frontmatter: Record<string, unknown>): HTMLElement {
	const el = document.createElement("div");
	tableCard.render(nativeCardEntry(PATH, frontmatter), el, getDeps());
	return el;
}

describe("tableCard [PRD/F4]", () => {
	it("has a stable id/label distinct from Hero", () => {
		expect(tableCard.id).toBe("table");
		expect(tableCard.label).toBe("Table");
	});

	it("renders the name via the host's nameEl seam", () => {
		const el = render({ tags: ["canon/location"] });

		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Moonharbor");
	});

	it("shows a column for every fact and relation of the entry's classified kind", () => {
		const el = render({ tags: ["canon/location"], locationType: "harbour", region: "Aerdis" });

		// location: facts locationType/region/aliases/first_appearance, relations world/inhabitants.
		// Labels go through humanizeFieldLabel — locationType shortens to "type",
		// first_appearance to "first seen" (panel/components.ts's FIELD_LABELS).
		const labels = Array.from(el.querySelectorAll(".sf-cx-table-cell b")).map((b) => b.textContent);
		expect(labels).toEqual(["type", "region", "aliases", "first seen", "world", "inhabitants"]);
	});

	it("marks an absent column, never the literal text 'undefined'", () => {
		const el = render({ tags: ["canon/location"] });

		expect(el.textContent).not.toContain("undefined");
		expect(el.querySelectorAll(".sf-cx-miss").length).toBeGreaterThan(0);
	});

	it("renders a present-but-blank column normally, without .miss", () => {
		const el = render({ tags: ["canon/location"], locationType: "" });

		const typeCell = Array.from(el.querySelectorAll(".sf-cx-table-cell")).find(
			(c) => c.querySelector("b")?.textContent === "type",
		);
		expect(typeCell?.querySelector(".sf-cx-miss")).toBeNull();
		expect(typeCell?.querySelector(".sf-cx-fact-v")?.textContent).toBe("");
	});

	it("still renders the name when every expected column is absent", () => {
		const el = render({ tags: ["canon/location"] });

		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Moonharbor");
	});

	it("degrades to just the name for a kind none of the built-in collections classify", () => {
		const el = render({ tags: ["canon/creature"] });

		expect(el.querySelectorAll(".sf-cx-table-cell").length).toBe(1); // the name cell only
		expect(el.querySelector(".sf-cx-miss")).toBeNull();
	});
});
