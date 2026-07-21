/**
 * CodexBasesView tests — T3.2 (RED → GREEN).
 *
 * CodexBasesView extends BasesView (lives in src/bases/ per CON-3).
 * It delegates all DOM rendering to codexGrid (pure DOM, no Bases typings).
 *
 * Contracts verified:
 *   - onDataUpdated() reads this.data FRESH each call (no BasesEntry caching)
 *   - onDataUpdated() empties the container before repainting (CON-4)
 *   - Maps BasesEntry[] → plain CodexRow[] (path from entry.file.path,
 *     fields from entry.getValue over kindFields property IDs)
 *   - Reads category from config.get("category")
 *   - Unknown/missing category falls back safely (no crash)
 *   - teardown leaves no retained entries (no stale BasesEntry references)
 *   - onRowClick callback passed through to deps
 *
 * @ref SDD/ADR-2   — one polymorphic type; category via config.get; NEVER cache BasesEntry
 * @ref SDD/CON-3   — CodexBasesView in src/bases/; delegates rendering to codexGrid
 * @ref SDD/CON-4   — teardown → empty → render
 * @ref PRD/AC-F2.1 — category grid renders
 * @ref PRD/AC-F2.3 — empty-state shown
 * @ref PRD/AC-F2.4 — read-only
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	QueryController,
	BasesViewConfig,
	BasesEntry,
	BasesQueryResult,
	App,
	TFile,
} from "../__mocks__/obsidian";
import { CodexBasesView } from "bases/CodexBasesView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeController(): QueryController {
	return new QueryController();
}

function makeConfig(category?: string): BasesViewConfig {
	const config = new BasesViewConfig();
	vi.spyOn(config, "get").mockImplementation((key: string): unknown => {
		if (key === "category") return category ?? "character";
		return undefined;
	});
	return config;
}

function makeEntry(path: string, fields: Record<string, unknown> = {}): BasesEntry {
	const entry = new BasesEntry();
	const file = new TFile();
	file.path = path;
	entry.file = file;
	entry.getValue.mockImplementation((propId: string): unknown => fields[propId] ?? null);
	return entry;
}

function makeResult(entries: BasesEntry[]): BasesQueryResult {
	const result = new BasesQueryResult();
	result.data = entries;
	return result;
}

function makeView(category?: string): {
	view: CodexBasesView;
	container: HTMLElement;
	onRowClick: ReturnType<typeof vi.fn>;
} {
	const controller = makeController();
	const container = document.createElement("div");
	const onRowClick = vi.fn();
	const view = new CodexBasesView(controller, container, { app: new App(), onRowClick });
	view.config = makeConfig(category);
	return { view, container, onRowClick };
}

// ---------------------------------------------------------------------------
// Fresh-read (no BasesEntry caching) — ADR-2 core invariant
// ---------------------------------------------------------------------------

describe("CodexBasesView — no BasesEntry caching (ADR-2)", () => {
	it("reads this.data fresh on each onDataUpdated call", () => {
		const { view, container } = makeView("character");

		// First call: one entry
		const entry1 = makeEntry("Characters/Mara.md", { role: "Protagonist" });
		view.data = makeResult([entry1]);
		view.onDataUpdated();

		const pathsAfterFirst = Array.from(container.querySelectorAll("[data-path]"))
			.map((el) => el.getAttribute("data-path"));
		expect(pathsAfterFirst).toContain("Characters/Mara.md");

		// Second call: different data — view must re-read from this.data
		const entry2 = makeEntry("Characters/Kael.md", { role: "Antagonist" });
		view.data = makeResult([entry2]);
		view.onDataUpdated();

		const pathsAfterSecond = Array.from(container.querySelectorAll("[data-path]"))
			.map((el) => el.getAttribute("data-path"));
		// Mara must be GONE (container emptied) and Kael must be present
		expect(pathsAfterSecond).not.toContain("Characters/Mara.md");
		expect(pathsAfterSecond).toContain("Characters/Kael.md");
	});

	it("does not hold a reference to old BasesEntry objects after onDataUpdated completes", () => {
		// We can't directly inspect private fields, but we CAN verify that
		// the rendered DOM reflects only the LATEST data.data contents.
		const { view, container } = makeView("character");

		const staleEntry = makeEntry("stale.md");
		view.data = makeResult([staleEntry]);
		view.onDataUpdated();

		// Replace data with empty set — onDataUpdated must use fresh data.data
		view.data = makeResult([]);
		view.onDataUpdated();

		// Container must show empty-state, not the stale entry
		expect(container.querySelectorAll("[data-path]")).toHaveLength(0);
		expect(container.querySelector("[data-empty-state]")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// CON-4: empty before repaint
// ---------------------------------------------------------------------------

describe("CodexBasesView — empty before repaint (CON-4)", () => {
	it("empties the container before each repaint", () => {
		const { view, container } = makeView("character");

		// First render
		view.data = makeResult([makeEntry("a.md")]);
		view.onDataUpdated();
		expect(container.querySelectorAll("[data-path]")).toHaveLength(1);

		// Inject a sentinel to detect whether the container was cleared
		const sentinel = document.createElement("span");
		sentinel.setAttribute("data-sentinel", "yes");
		container.appendChild(sentinel);

		// Second render — sentinel must be gone
		view.data = makeResult([makeEntry("b.md"), makeEntry("c.md")]);
		view.onDataUpdated();

		expect(container.querySelector("[data-sentinel]")).toBeNull();
		expect(container.querySelectorAll("[data-path]")).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Entry → plain row mapping
// ---------------------------------------------------------------------------

describe("CodexBasesView — BasesEntry to plain row mapping", () => {
	it("maps entry.file.path to row path", () => {
		const { view, container } = makeView("character");

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		expect(container.querySelector("[data-path='Characters/Mara.md']")).not.toBeNull();
	});

	it("calls entry.getValue for each kindFields property id", () => {
		const { view } = makeView("character");

		const entry = makeEntry("x.md", { role: "Scout", status: "Active" });
		view.data = makeResult([entry]);
		view.onDataUpdated();

		// getValue should have been called (at minimum for facts + relations)
		expect(entry.getValue).toHaveBeenCalled();
	});

	it("renders multiple entries as multiple rows", () => {
		const { view, container } = makeView("location");

		view.data = makeResult([
			makeEntry("loc/A.md"),
			makeEntry("loc/B.md"),
			makeEntry("loc/C.md"),
		]);
		view.onDataUpdated();

		expect(container.querySelectorAll("[data-path]")).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// Category from config.get
// ---------------------------------------------------------------------------

describe("CodexBasesView — category from config.get", () => {
	it("reads category from config.get('category')", () => {
		const { view, container } = makeView("scene");

		view.data = makeResult([makeEntry("s1.md")]);
		view.onDataUpdated();

		expect(view.config.get).toHaveBeenCalledWith("category");
		expect(container.querySelector("[data-path='s1.md']")).not.toBeNull();
	});

	it("falls back safely when config.get returns undefined (no crash)", () => {
		const controller = makeController();
		const container = document.createElement("div");
		const view = new CodexBasesView(controller, container, {
			app: new App(),
			onRowClick: vi.fn(),
		});

		// Config with undefined category
		const config = new BasesViewConfig();
		vi.spyOn(config, "get").mockReturnValue(undefined);
		view.config = config;
		view.data = makeResult([makeEntry("x.md")]);

		expect(() => view.onDataUpdated()).not.toThrow();
	});

	it("falls back safely when config.get returns an unknown string (no crash)", () => {
		const { view } = makeView("totally-unknown-kind");

		view.data = makeResult([makeEntry("x.md")]);
		expect(() => view.onDataUpdated()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Empty-state (S45)
// ---------------------------------------------------------------------------

describe("CodexBasesView — empty state (PRD/AC-F2.3)", () => {
	it("renders empty-state when data.data is empty", () => {
		const { view, container } = makeView("character");

		view.data = makeResult([]);
		view.onDataUpdated();

		expect(container.querySelector("[data-empty-state]")).not.toBeNull();
	});

	it("does not render empty-state when entries are present", () => {
		const { view, container } = makeView("character");

		view.data = makeResult([makeEntry("x.md")]);
		view.onDataUpdated();

		expect(container.querySelector("[data-empty-state]")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// onRowClick wired through to codexGrid
// ---------------------------------------------------------------------------

describe("CodexBasesView — onRowClick callback", () => {
	it("passes onRowClick to codexGrid so clicking a row fires it with the path", () => {
		const { view, container, onRowClick } = makeView("character");
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		const rowEl = container.querySelector("[data-path='Characters/Mara.md']") as HTMLElement;
		expect(rowEl).not.toBeNull();
		rowEl.click();

		expect(onRowClick).toHaveBeenCalledTimes(1);
		expect(onRowClick).toHaveBeenCalledWith("Characters/Mara.md");

		document.body.removeChild(container);
	});
});

// ---------------------------------------------------------------------------
// Teardown — no retained entries
// ---------------------------------------------------------------------------

describe("CodexBasesView — teardown leaves no retained entries", () => {
	it("unload() calls the component teardown without throwing", () => {
		const { view, container } = makeView("character");

		view.data = makeResult([makeEntry("a.md")]);
		view.onDataUpdated();
		expect(container.querySelectorAll("[data-path]")).toHaveLength(1);

		// Simulate Obsidian unloading the component — must not throw.
		expect(() => view.unload()).not.toThrow();
	});

	/**
	 * CON-4: post-unload guard — onDataUpdated() must be inert after unload().
	 *
	 * Obsidian stops calling onDataUpdated once a view is unregistered, so this
	 * is defensive hardening. The guard ensures no stale content bleed after
	 * teardown (CON-4: no stale content bleed for every Bases surface).
	 */
	it("onDataUpdated() is inert after unload() — pre-unload content is preserved, new data is not rendered", () => {
		const { view, container } = makeView("character");

		// Pre-unload render with one entry.
		view.data = makeResult([makeEntry("pre-unload.md")]);
		view.onDataUpdated();
		expect(container.querySelector("[data-path='pre-unload.md']")).not.toBeNull();

		view.unload();

		// Post-unload: set new data and call onDataUpdated.
		// The guard must prevent any repaint — the container stays inert.
		view.data = makeResult([makeEntry("post-unload.md")]);
		view.onDataUpdated();

		// The new data must NOT appear — no stale bleed after teardown (CON-4).
		expect(container.querySelector("[data-path='post-unload.md']")).toBeNull();
	});
});
