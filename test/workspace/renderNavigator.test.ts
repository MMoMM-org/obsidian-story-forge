/**
 * renderNavigator.test.ts — M5 Phase 3 (RED). Sidebar Navigator (mockup S59).
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md (T3.3)
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { timelineModel, plotlineModel, statusTally, type SceneRow } from "workspace/workspaceModel";
import { renderNavigator, type NavigatorData } from "workspace/renderNavigator";

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

const resolverFor = (known: string[]) => (t: string) => (known.includes(t) ? { basename: t } : null);
const expanded = { isCollapsed: () => false };

function dataFrom(rows: SceneRow[], known: string[]): NavigatorData {
	return {
		actGroups: timelineModel(rows),
		plotlineGroups: plotlineModel(rows, resolverFor(known)),
		tally: statusTally(rows),
	};
}

describe("renderNavigator", () => {
	const rows = [
		row({ title: "The Extinguished Fire", act: 1, order: 1, when: "Night 1", status: "draft", plotlines: ["[[The Dying Light]]"] }),
		row({ title: "The Salty Gull", act: 1, order: 2, when: "Night 1", status: "draft", plotlines: ["[[The Dying Light]]"] }),
		row({ title: "The Signal Tower", act: 2, order: 4, when: "Night 3", status: "outline", plotlines: ["[[The Warden's Oath]]"] }),
	];

	it("renders a filter box and a plotline filter list with an All row + counts + data-sf-plotline", () => {
		const el = host();
		renderNavigator(el, dataFrom(rows, ["The Dying Light", "The Warden's Oath"]), { plotlineFilter: null }, expanded);

		expect(el.querySelector(".sf-nav-filter")).not.toBeNull();
		const plRows = [...el.querySelectorAll(".sf-nav-pl-row")];
		const labels = plRows.map((r) => r.getAttribute("data-sf-plotline"));
		expect(labels).toContain(""); // All
		expect(labels).toContain("The Dying Light");
		expect(labels).toContain("The Warden's Oath");
		// All row selected when no filter
		const all = plRows.find((r) => r.getAttribute("data-sf-plotline") === "");
		expect(all!.classList.contains("sf-nav-pl-row--sel")).toBe(true);
	});

	it("marks the active plotline filter as selected", () => {
		const el = host();
		renderNavigator(el, dataFrom(rows, ["The Dying Light", "The Warden's Oath"]), { plotlineFilter: "The Warden's Oath" }, expanded);
		const sel = el.querySelector(".sf-nav-pl-row--sel");
		expect(sel?.getAttribute("data-sf-plotline")).toBe("The Warden's Oath");
	});

	it("renders act-grouped scene rows (dot + order + clickable title + when)", () => {
		const el = host();
		renderNavigator(el, dataFrom(rows, ["The Dying Light", "The Warden's Oath"]), { plotlineFilter: null }, expanded);
		const scRow = el.querySelector(".sf-nav-sc-row") as HTMLElement;
		expect(scRow.querySelector(".sf-nav-dot")).not.toBeNull();
		expect(scRow.querySelector(".sf-nav-idx")?.textContent).toBe("1");
		expect(scRow.querySelector(".sf-lrow-lnk")?.getAttribute("data-sf-link")).toBe("The Extinguished Fire.md");
		expect(scRow.querySelector(".sf-nav-when")?.textContent).toBe("Night 1");
	});

	it("renders a progress indicator derived from the status tally", () => {
		const el = host();
		renderNavigator(el, dataFrom(rows, ["The Dying Light", "The Warden's Oath"]), { plotlineFilter: null }, expanded);
		const prog = el.querySelector(".sf-nav-prog");
		expect(prog).not.toBeNull();
		expect(prog?.textContent).toContain("draft 2");
	});

	it("drives the progress fill through a CSS custom property (#49)", () => {
		const el = host();
		// One of four scenes written → 25%.
		const data = { ...dataFrom(rows, ["The Dying Light"]), tally: { written: 1, draft: 3 } };
		renderNavigator(el, data, { plotlineFilter: null }, expanded);
		const fill = el.querySelector(".sf-nav-prog-bar i") as HTMLElement;
		expect(fill.style.getPropertyValue("--sf-nav-progress")).toBe("25%");
		expect(fill.style.width).toBe("");
	});

	it("renders an empty-state when there are no scenes", () => {
		const el = host();
		renderNavigator(el, { actGroups: [], plotlineGroups: [], tally: {} }, { plotlineFilter: null }, expanded);
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
		expect(el.querySelector(".sf-nav-sc-row")).toBeNull();
	});
});
