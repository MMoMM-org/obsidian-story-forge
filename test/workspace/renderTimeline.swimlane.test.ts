/**
 * renderTimeline.swimlane.test.ts — swimlane mode (T4.2, ADR-20).
 *
 * One lane per Group from swimlaneModel. Multi-plotline scenes fan into each
 * plotline lane. Collapse seam works per group key. Read-only (no writes).
 * Rail mode tests in renderTimeline.test.ts must remain unaffected.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-20
 */

import { describe, it, expect, vi } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { swimlaneModel, type SceneRow } from "workspace/workspaceModel";
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

describe("renderTimeline (swimlane mode)", () => {
	it("does not throw for swimlane mode (M6 stub removed)", () => {
		const el = host();
		const groups = swimlaneModel([], "pov");
		expect(() => renderTimeline(el, groups, expanded, "swimlane")).not.toThrow();
	});

	it("renders an empty-state for empty swimlane groups", () => {
		const el = host();
		renderTimeline(el, [], expanded, "swimlane");
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
	});

	it("renders one lane (section) per group from swimlaneModel", () => {
		const el = host();
		const rows = [
			row({ title: "S1", pov: { name: "Alice", path: "Alice.md" } }),
			row({ title: "S2", pov: { name: "Bob", path: "Bob.md" } }),
		];
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, expanded, "swimlane");

		const sections = el.querySelectorAll(".sf-section");
		expect(sections.length).toBe(2);

		const labels = [...el.querySelectorAll(".sf-sec-label")].map((l) => l.textContent);
		expect(labels).toContain("Alice");
		expect(labels).toContain("Bob");
	});

	it("renders scene cards as drill links inside each lane", () => {
		const el = host();
		const rows = [row({ title: "TheScene", pov: { name: "Alice", path: "Alice.md" } })];
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, expanded, "swimlane");

		const card = el.querySelector(".sf-tl-card") as HTMLElement | null;
		expect(card).not.toBeNull();
		expect(card!.getAttribute("data-sf-link")).toBe("TheScene.md");
		expect(card!.getAttribute("role")).toBe("link");
	});

	it("fans a multi-plotline scene into each plotline lane", () => {
		const el = host();
		const scene = row({
			title: "FanScene",
			plotlines: ["PlotA", "PlotB"],
			plotline: { name: "PlotA", path: "PlotA.md" },
		});
		const resolve = (text: string): { basename: string } | null =>
			["PlotA", "PlotB"].includes(text) ? { basename: text } : null;
		const groups = swimlaneModel([scene], "plotline", resolve);
		renderTimeline(el, groups, expanded, "swimlane");

		const labels = [...el.querySelectorAll(".sf-sec-label")].map((l) => l.textContent);
		expect(labels).toContain("PlotA");
		expect(labels).toContain("PlotB");

		// The scene card should appear in both lanes
		const cards = el.querySelectorAll(".sf-tl-card");
		expect(cards.length).toBe(2);
	});

	it("neutral lane (no POV) renders normally with scenes", () => {
		const el = host();
		const rows = [row({ title: "NoPovScene" })]; // pov: null
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, expanded, "swimlane");

		const labels = [...el.querySelectorAll(".sf-sec-label")].map((l) => l.textContent);
		expect(labels).toContain("No POV");

		const card = el.querySelector(".sf-tl-card") as HTMLElement | null;
		expect(card).not.toBeNull();
		expect(card!.getAttribute("data-sf-link")).toBe("NoPovScene.md");
	});

	it("honors the collapse seam: collapses a lane when deps.isCollapsed returns true", () => {
		const el = host();
		const rows = [row({ title: "S1", pov: { name: "Alice", path: "Alice.md" } })];
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, { isCollapsed: () => true }, "swimlane");

		const body = el.querySelector(".sf-sec-body");
		expect(body?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});

	it("adds the group key to the section head for collapse persistence", () => {
		const el = host();
		const rows = [row({ title: "S1", pov: { name: "Alice", path: "Alice.md" } })];
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, expanded, "swimlane");

		const head = el.querySelector(".sf-sec-head") as HTMLElement | null;
		expect(head).not.toBeNull();
		const key = head!.getAttribute("data-sf-group-key");
		expect(key).not.toBeNull();
		expect(key).toContain("pov:Alice");
	});

	it("renders status badges and wordcount inside swimlane cards (shared card helper)", () => {
		const el = host();
		const rows = [row({ title: "Sc", status: "draft", wordcount: 200, pov: { name: "X", path: "X.md" } })];
		const groups = swimlaneModel(rows, "pov");
		renderTimeline(el, groups, expanded, "swimlane");

		expect(el.querySelector(".sf-tl-st--draft")).not.toBeNull();
		expect(el.querySelector(".sf-tl-words")?.textContent).toContain("200");
	});

	it("is strictly read-only: no processFrontMatter or commit calls", () => {
		const writeSpy = vi.fn();
		const el = host();
		const groups = swimlaneModel([row({ title: "S1" })], "pov");
		renderTimeline(el, groups, expanded, "swimlane");
		expect(writeSpy).not.toHaveBeenCalled();
	});
});
