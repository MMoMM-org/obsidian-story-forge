/**
 * renderTimeline.test.ts — M5 Phase 3 (RED). Rail mode (mockup S62).
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md (T3.2)
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

describe("renderTimeline (rail)", () => {
	it("renders one act pill per group, labeled from the group label", () => {
		const el = host();
		const groups = timelineModel([
			row({ title: "S1", act: 1, order: 1, beatName: "The Failing Light" }),
			row({ title: "S2", act: 2, order: 2 }),
		]);
		renderTimeline(el, groups);
		const pills = [...el.querySelectorAll(".sf-tl-actpill")].map((p) => p.textContent);
		expect(pills).toEqual(["Act 1 · The Failing Light", "Act 2"]);
	});

	it("renders a scene card with a clickable title (data-sf-link), node color, status + wordcount", () => {
		const el = host();
		const groups = timelineModel([
			row({
				title: "The Salty Gull",
				act: 1,
				order: 1,
				status: "draft",
				pov: "Mara Stoneway",
				location: "The Salty Gull",
				wordcount: 185,
				plotlines: ["[[The Dying Light]]"],
				characters: ["Mara Stoneway", "Jonas Kell"],
			}),
		]);
		renderTimeline(el, groups);

		const link = el.querySelector(".sf-tl-card .sf-lrow-lnk") as HTMLElement;
		expect(link.textContent).toBe("The Salty Gull");
		expect(link.getAttribute("data-sf-link")).toBe("The Salty Gull.md");

		const node = el.querySelector(".sf-tl-node") as HTMLElement;
		expect(node.style.background).toBe(hexToRgb(plotlineColor("The Dying Light")));

		const badge = el.querySelector(".sf-tl-st") as HTMLElement;
		expect(badge.classList.contains("sf-tl-st--draft")).toBe(true);
		expect(badge.textContent).toBe("draft");

		expect(el.querySelector(".sf-tl-words")?.textContent).toContain("185");
		expect(el.querySelectorAll(".sf-tl-chip")).toHaveLength(2);
	});

	it("renders an empty-state for no groups", () => {
		const el = host();
		renderTimeline(el, []);
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
		expect(el.querySelector(".sf-tl-actpill")).toBeNull();
	});

	it("throws for a non-rail mode (swimlane is M6)", () => {
		expect(() => renderTimeline(host(), [], "swimlane")).toThrow(/M6/);
	});
});

// jsdom normalizes `style.background` set to a hex into `rgb(...)`.
function hexToRgb(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
