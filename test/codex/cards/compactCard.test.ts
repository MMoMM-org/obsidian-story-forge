/**
 * compactCard.test.ts — T4.3 (spec 008-codex-surface, Phase 4).
 *
 * Compact renders the SAME entries Hero/Table do, at the tightest density:
 * name plus a couple of key facts, one line, no image, no relation pills.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { describe, expect, it } from "vitest";
// Side-effect import: the obsidian mock sets globalThis.activeDocument, which
// the Card modules rely on for DOM construction.
import "../../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderDeps } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { compactCard } from "codex/cards/compactCard";

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";

function getDeps(compact = false): CardRenderDeps {
	return {
		compact,
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
	compactCard.render(nativeCardEntry(PATH, frontmatter), el, getDeps());
	return el;
}

describe("compactCard [PRD/F4]", () => {
	it("has a stable id/label distinct from Hero and Table", () => {
		expect(compactCard.id).toBe("compact");
		expect(compactCard.label).toBe("Compact");
	});

	it("shows the name plus a couple of key facts, one line, no image", () => {
		const el = render({ tags: ["canon/character"], role: "Protagonist", status: "Alive", occupation: "Warden" });

		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).toBeNull();
		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Mara Stoneway");

		const labels = Array.from(el.querySelectorAll(".sf-cx-fact b")).map((b) => b.textContent);
		// Capped to two facts — tighter than Hero's three.
		expect(labels).toEqual(["role", "status"]);
	});

	it("shows no relation pills at all", () => {
		const el = render({ tags: ["canon/character"], allies: ["[[Tobias Ferro]]"] });

		expect(el.querySelector(".sf-cx-relpill")).toBeNull();
	});

	it("marks an absent key fact, never the literal text 'undefined'", () => {
		const el = render({ tags: ["canon/character"] });

		expect(el.textContent).not.toContain("undefined");
		const miss = el.querySelector(".sf-cx-miss");
		expect(miss?.querySelector("b")?.textContent).toBe("role");
		expect(miss?.querySelector("i")?.textContent).toBe("Not set");
		expect(miss?.getAttribute("title")).toBe("This property does not exist in this note");
	});

	it("renders a present-but-blank key fact normally, without .miss", () => {
		const el = render({ tags: ["canon/character"], role: "", status: "Alive" });

		expect(el.querySelector(".sf-cx-miss")).toBeNull();
		const values = Array.from(el.querySelectorAll(".sf-cx-fact-v")).map((v) => v.textContent);
		expect(values).toEqual(["", "Alive"]);
	});

	it("still renders the name when every expected fact is absent (S97)", () => {
		const el = render({ tags: ["canon/creature"] }); // unknown kind — no expected facts at all

		expect(el.querySelector(`[data-sf-link="${PATH}"]`)?.textContent).toBe("Mara Stoneway");
		expect(el.querySelector(".sf-cx-fact")).toBeNull();
		expect(el.querySelector(".sf-cx-miss")).toBeNull();
	});
});
