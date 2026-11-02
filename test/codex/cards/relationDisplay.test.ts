/**
 * relationDisplay.test.ts — relation values never show raw `[[ ]]` brackets.
 *
 * One shared helper (`linkDisplay`, shared.ts) feeds the relation pills, the
 * Hero facts line and the Table/Compact fact chips. The marker keeps the full
 * target; only the visible text changes.
 */

import { describe, expect, it } from "vitest";
import "../../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderDeps } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { compactCard } from "codex/cards/compactCard";
import { heroCard } from "codex/cards/heroCard";
import { tableCard } from "codex/cards/tableCard";
import { entryPills, linkDisplay } from "codex/cards/shared";

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";

function deps(): CardRenderDeps {
	return {
		compact: false,
		nameEl: (entry: CardEntry) => {
			const n = document.createElement("span");
			n.textContent = entry.name;
			return n;
		},
		resolveAsset: (raw) => raw,
		tileField: nativeTileField,
	};
}

const entry = (fm: Record<string, unknown>): CardEntry => nativeCardEntry(PATH, { tags: ["canon/character"], ...fm });

describe("linkDisplay", () => {
	it.each([
		["[[Tobias Ferro]]", "Tobias Ferro"],
		["[[Tobias Ferro|Toby]]", "Toby"],
		["[[Folder/Mara#h]]", "Mara"],
		["[[Folder/Mara.md]]", "Mara"],
		["[[Folder/Mara#h|Em]]", "Em"],
		["plain text", "plain text"],
		["[[A]], [[B|b]]", "A, b"],
	])("%s -> %s", (raw, shown) => expect(linkDisplay(raw)).toBe(shown));
});

describe("relation values show no brackets", () => {
	it("entryPills: text is display form, marker keeps the full target", () => {
		const pills = entryPills(entry({ allies: ["[[Folder/Mara#h]]", "[[Tobias Ferro|Toby]]", "Plain"] }), "allies");
		expect(pills.map((p) => p.textContent)).toEqual(["Mara", "Toby", "Plain"]);
		expect(pills[0]?.getAttribute("data-sf-link")).toBe("Folder/Mara");
		expect(pills[2]?.hasAttribute("data-sf-link")).toBe(false);
	});

	it("Hero facts line", () => {
		const el = document.createElement("div");
		heroCard.render(entry({ role: "[[Warden|Boss]]", status: "Alive" }), el, deps());
		expect(el.querySelector(".sf-cx-hero-facts")?.textContent).not.toContain("[[");
		expect(el.querySelector(".sf-cx-hero-fact-v")?.textContent).toBe("Boss");
	});

	it.each([["table", tableCard], ["compact", compactCard]] as const)("%s fact chip", (_n, card) => {
		const el = document.createElement("div");
		card.render(entry({ role: "[[Warden|Boss]]", status: "Alive" }), el, deps());
		expect(el.textContent).not.toContain("[[");
		expect(el.textContent).toContain("Boss");
	});
});
