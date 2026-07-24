/**
 * renderTimeline.test.ts — rail mode (mockup S62/S63). Collapsible act sections,
 * whole-card drill, `when` gutter, POV pill.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md (T3.2) + timeline refinements
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { timelineModel, plotlineColor, type SceneRow } from "workspace/workspaceModel";
import { renderTimeline } from "workspace/renderTimeline";

function host(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function row(o: Partial<SceneRow> & { title: string }): SceneRow {
	return {
		file: createMockTFile({ basename: o.title, path: `${o.title}.md` }),
		title: o.title,
		act: o.act ?? null,
		order: o.order ?? null,
		storyDay: o.storyDay ?? null,
		when: o.when ?? "",
		status: o.status ?? "",
		pov: o.pov ?? "",
		location: o.location ?? "",
		characters: o.characters ?? [],
		plotlines: o.plotlines ?? [],
		beat: o.beat ?? "",
		beatName: o.beatName ?? "",
		wordcount: o.wordcount ?? null,
	};
}

const expanded = { isCollapsed: () => false };

describe("renderTimeline (rail)", () => {
	it("renders one collapsible section per act, labeled from the group label", () => {
		const el = host();
		const groups = timelineModel([
			row({ title: "S1", act: 1, order: 1, beatName: "The Failing Light" }),
			row({ title: "S2", act: 2, order: 2 }),
		]);
		renderTimeline(el, groups, expanded);
		expect(el.querySelectorAll(".sf-section")).toHaveLength(2);
		expect([...el.querySelectorAll(".sf-sec-label")].map((l) => l.textContent)).toEqual([
			"Act 1 · The Failing Light",
			"Act 2",
		]);
		expect([...el.querySelectorAll(".sf-sec-head")].map((h) => h.getAttribute("data-sf-group-key"))).toEqual([
			"act:1",
			"act:2",
		]);
	});

	it("renders a scene card that drills as a whole (data-sf-link on the card), with when/POV/status/words/chips", () => {
		const el = host();
		const groups = timelineModel([
			row({
				title: "The Salty Gull",
				act: 1,
				order: 1,
				when: "Night 1",
				status: "draft",
				pov: "Mara Stoneway",
				location: "The Salty Gull",
				wordcount: 185,
				plotlines: ["[[The Dying Light]]"],
				characters: ["Mara Stoneway", "Jonas Kell"],
			}),
		]);
		renderTimeline(el, groups, expanded);

		const card = el.querySelector(".sf-tl-card") as HTMLElement;
		expect(card.getAttribute("data-sf-link")).toBe("The Salty Gull.md");
		expect(card.getAttribute("role")).toBe("link");
		expect(card.querySelector(".sf-tl-ct")?.textContent).toBe("The Salty Gull");

		expect(el.querySelector(".sf-tl-when")?.textContent).toBe("Night 1");
		expect(el.querySelector(".sf-tl-pov")?.textContent).toBe("Mara Stoneway");
		expect(el.querySelector(".sf-tl-loc")?.textContent).toBe("The Salty Gull");

		const node = el.querySelector(".sf-tl-node") as HTMLElement;
		expect(node.style.background).toBe(hexToRgb(plotlineColor("The Dying Light")));

		const badge = el.querySelector(".sf-tl-st") as HTMLElement;
		expect(badge.classList.contains("sf-tl-st--draft")).toBe(true);
		expect(el.querySelector(".sf-tl-words")?.textContent).toContain("185");
		expect(el.querySelectorAll(".sf-tl-chip")).toHaveLength(2);
	});

	it("shows a — placeholder in the when gutter when `when` is empty", () => {
		const el = host();
		renderTimeline(el, timelineModel([row({ title: "S", act: 1, order: 1 })]), expanded);
		expect(el.querySelector(".sf-tl-when")?.textContent).toBe("—");
	});

	it("honors the injected initial collapsed state", () => {
		const el = host();
		const groups = timelineModel([row({ title: "S1", act: 1, order: 1 })]);
		renderTimeline(el, groups, { isCollapsed: (g) => g === "act:1" });
		expect(el.querySelector(".sf-sec-body")?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});

	it("renders an empty-state for no groups", () => {
		const el = host();
		renderTimeline(el, [], expanded);
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
		expect(el.querySelector(".sf-section")).toBeNull();
	});

	it("throws for a non-rail mode (swimlane is M6)", () => {
		expect(() => renderTimeline(host(), [], expanded, "swimlane")).toThrow(/M6/);
	});
});

// jsdom normalizes `style.background` set to a hex into `rgb(...)`.
function hexToRgb(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
