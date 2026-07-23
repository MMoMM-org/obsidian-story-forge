/**
 * renderPlotlines.test.ts — M5 Phase 3 (RED). List mode (mockup S69).
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md (T3.2)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { plotlineModel, type SceneRow } from "workspace/workspaceModel";
import { renderPlotlines } from "workspace/renderPlotlines";

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

const resolverFor = (known: string[]) => (t: string) => (known.includes(t) ? { basename: t } : null);
const allExpanded = { isCollapsed: () => false };

describe("renderPlotlines (list)", () => {
	it("renders a collapsible section per group with a count and a colored dot", () => {
		const el = host();
		const groups = plotlineModel(
			[row({ title: "X", order: 1, plotlines: ["[[The Dying Light]]"] })],
			resolverFor(["The Dying Light"]),
		);
		renderPlotlines(el, groups, allExpanded);

		const sections = el.querySelectorAll(".sf-section");
		expect(sections).toHaveLength(1);
		expect(el.querySelector(".sf-count")?.textContent).toContain("1");
		const dot = el.querySelector(".sf-sec-head .sf-pl-dot") as HTMLElement;
		expect(dot).not.toBeNull();
		expect(dot.style.background).not.toBe("");
	});

	it("stamps data-sf-group-key on the header and data-sf-link on scene rows", () => {
		const el = host();
		const groups = plotlineModel(
			[row({ title: "The Salty Gull", order: 2, status: "draft", plotlines: ["[[The Dying Light]]"] })],
			resolverFor(["The Dying Light"]),
		);
		renderPlotlines(el, groups, allExpanded);
		expect(el.querySelector(".sf-sec-head")?.getAttribute("data-sf-group-key")).toBe("plotline:The Dying Light");
		expect(el.querySelector(".sf-sec-body .sf-lrow-lnk")?.getAttribute("data-sf-link")).toBe("The Salty Gull.md");
	});

	it("honors the injected initial collapsed state", () => {
		const el = host();
		const groups = plotlineModel([row({ title: "X", plotlines: ["[[A]]"] })], resolverFor(["A"]));
		renderPlotlines(el, groups, { isCollapsed: (g) => g === "plotline:A" });
		const body = el.querySelector(".sf-sec-body") as HTMLElement;
		expect(body.classList.contains("sf-sec-body--collapsed")).toBe(true);
		expect(el.querySelector(".sf-sec-head")?.getAttribute("aria-expanded")).toBe("false");
	});

	it("places Unassigned last and flags an unresolved group", () => {
		const el = host();
		const groups = plotlineModel(
			[
				row({ title: "resolved", plotlines: ["[[Alpha]]"] }),
				row({ title: "ghost", plotlines: ["[[Broken]]"] }),
				row({ title: "loose", plotlines: [] }),
			],
			resolverFor(["Alpha"]),
		);
		renderPlotlines(el, groups, allExpanded);
		const labels = [...el.querySelectorAll(".sf-sec-label")].map((l) => l.textContent);
		expect(labels).toEqual(["Alpha", "Broken", "Unassigned"]);
		const heads = [...el.querySelectorAll(".sf-sec-head")];
		expect(heads[1]!.classList.contains("sf-pl-unresolved")).toBe(true);
		expect(heads[2]!.classList.contains("sf-pl-unassigned")).toBe(true);
	});

	it("renders an empty-state for no groups", () => {
		const el = host();
		renderPlotlines(el, [], allExpanded);
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
	});

	it("throws for a non-list mode (subway is M6)", () => {
		expect(() => renderPlotlines(host(), [], allExpanded, "subway")).toThrow(/M6/);
	});
});
