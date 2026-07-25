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
		pov: o.pov ?? null,
		location: o.location ?? null,
		characters: o.characters ?? [],
		plotline: o.plotline ?? null,
		plotlines: o.plotlines ?? [],
		beat: o.beat ?? "",
		beatName: o.beatName ?? "",
		beatPath: o.beatPath ?? "",
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

	it("makes the act label drill its shared beat note", () => {
		const el = host();
		const groups = timelineModel([
			row({ title: "S1", act: 1, order: 1, beatName: "The Failing Light", beatPath: "The Failing Light.md" }),
			row({ title: "S2", act: 1, order: 2, beatName: "The Failing Light", beatPath: "The Failing Light.md" }),
		]);
		renderTimeline(el, groups, expanded);
		const label = el.querySelector(".sf-sec-label") as HTMLElement;
		expect(label.textContent).toBe("Act 1 · The Failing Light");
		expect(label.getAttribute("data-sf-link")).toBe("The Failing Light.md");
	});

	it("renders a scene card whose whole body + fields are drill links", () => {
		const el = host();
		const groups = timelineModel([
			row({
				title: "The Salty Gull",
				act: 1,
				order: 1,
				when: "Night 1",
				status: "draft",
				pov: { name: "Mara Stoneway", path: "Mara Stoneway.md" },
				location: { name: "The Salty Gull", path: "The Salty Gull.md" },
				wordcount: 185,
				plotline: { name: "The Dying Light", path: "The Dying Light.md" },
				plotlines: ["[[The Dying Light]]"],
				characters: [
					{ name: "Mara Stoneway", path: "Mara Stoneway.md" },
					{ name: "Jonas Kell", path: "Jonas Kell.md" },
				],
			}),
		]);
		renderTimeline(el, groups, expanded);

		const card = el.querySelector(".sf-tl-card") as HTMLElement;
		expect(card.getAttribute("data-sf-link")).toBe("The Salty Gull.md");
		expect(card.querySelector(".sf-tl-ct")?.textContent).toBe("The Salty Gull");
		expect(el.querySelector(".sf-tl-when")?.textContent).toBe("Night 1");

		// POV + location are drill links.
		const pov = el.querySelector(".sf-tl-pov .sf-tl-flink") as HTMLElement;
		expect(pov.textContent).toBe("Mara Stoneway");
		expect(pov.getAttribute("data-sf-link")).toBe("Mara Stoneway.md");
		expect((el.querySelector(".sf-tl-loc .sf-tl-flink") as HTMLElement).getAttribute("data-sf-link")).toBe("The Salty Gull.md");

		// Dot: hover title + plotline drill; colour by plotline.
		const node = el.querySelector(".sf-tl-node") as HTMLElement;
		expect(node.getAttribute("title")).toBe("The Dying Light");
		expect(node.getAttribute("data-sf-link")).toBe("The Dying Light.md");
		expect(node.style.background).toBe(hexToRgb(plotlineColor("The Dying Light")));

		// Character chips are links; the POV character's chip is highlighted.
		const chips = [...el.querySelectorAll(".sf-tl-chip")] as HTMLElement[];
		expect(chips.map((c) => c.getAttribute("data-sf-link"))).toEqual(["Mara Stoneway.md", "Jonas Kell.md"]);
		expect(chips.find((c) => c.classList.contains("sf-tl-chip--pov"))?.textContent).toBe("Mara Stoneway");

		expect((el.querySelector(".sf-tl-st") as HTMLElement).classList.contains("sf-tl-st--draft")).toBe(true);
		expect(el.querySelector(".sf-tl-words")?.textContent).toContain("185");
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

	it("does not throw for swimlane mode (M6 swimlane is now implemented)", () => {
		// Swimlane mode is implemented in T4.2 — rail tests must stay green.
		expect(() => renderTimeline(host(), [], expanded, "swimlane")).not.toThrow();
	});
});

// jsdom normalizes `style.background` set to a hex into `rgb(...)`.
function hexToRgb(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
