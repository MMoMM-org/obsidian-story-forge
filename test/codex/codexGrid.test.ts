/**
 * codexGrid tests — T3.2 (RED → GREEN).
 *
 * codexGrid is a pure-DOM grid builder with ZERO Bases typings.
 * It accepts plain row records ({ path, fields }) and renders a grid
 * whose columns come from kindFields for the given category.
 *
 * Contracts verified:
 *   - Grid columns match kindFields(category).facts + kindFields(category).relations
 *   - Each row has data-path=record.path
 *   - Empty records renders S45 per-category empty-state
 *   - Delegated click on a row invokes onRowClick(path) exactly once
 *   - No <input>/<select>/contenteditable in the grid (read-only)
 *   - Unknown category falls back safely (no crash, generic/empty columns)
 *
 * @ref SDD/CON-3   — codexGrid must be Bases-typing-free
 * @ref SDD/CON-4   — teardown→empty→render discipline
 * @ref PRD/AC-F2.1 — category grid renders
 * @ref PRD/AC-F2.3 — empty-state shown
 * @ref PRD/AC-F2.4 — read-only (no editable inputs)
 */

import { describe, it, expect, vi } from "vitest";
// Side-effect import: polyfills globalThis.activeDocument = document in jsdom,
// which codexGrid.ts requires (Obsidian's popout-window-aware document reference).
import "../__mocks__/obsidian";
import { buildCodexGrid, type CodexRow } from "codex/codexGrid";
import { kindFields } from "panel/kindFields";
import type { EntityKind } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
	return document.createElement("div");
}

function makeRow(overrides?: Partial<CodexRow>): CodexRow {
	return {
		path: "Vault/Characters/Mara.md",
		fields: { role: "Protagonist", status: "Alive" },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Column rendering
// ---------------------------------------------------------------------------

describe("buildCodexGrid — column structure", () => {
	it("renders header columns that match kindFields facts + relations for character", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow()],
			onRowClick: vi.fn(),
		});

		const headers = Array.from(container.querySelectorAll("[data-column-id]")).map(
			(el) => el.getAttribute("data-column-id"),
		);

		const { facts, relations } = kindFields("character");
		const expectedColumns = [...facts, ...relations];
		for (const col of expectedColumns) {
			expect(headers).toContain(col);
		}
	});

	it("renders header columns for scene category", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "scene",
			rows: [makeRow({ path: "s1.md", fields: { act: "1" } })],
			onRowClick: vi.fn(),
		});

		const headers = Array.from(container.querySelectorAll("[data-column-id]")).map(
			(el) => el.getAttribute("data-column-id"),
		);

		const { facts, relations } = kindFields("scene");
		for (const col of [...facts, ...relations]) {
			expect(headers).toContain(col);
		}
	});
});

// ---------------------------------------------------------------------------
// Row rendering with data-path
// ---------------------------------------------------------------------------

describe("buildCodexGrid — row data-path", () => {
	it("stamps each row element with data-path matching the record path", () => {
		const container = makeContainer();
		const rows: CodexRow[] = [
			{ path: "A/Mara.md", fields: {} },
			{ path: "B/Kael.md", fields: {} },
		];
		buildCodexGrid(container, { category: "character", rows, onRowClick: vi.fn() });

		const rowEls = container.querySelectorAll("[data-path]");
		const paths = Array.from(rowEls).map((el) => el.getAttribute("data-path"));
		expect(paths).toContain("A/Mara.md");
		expect(paths).toContain("B/Kael.md");
	});

	it("renders one row element per record", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "location",
			rows: [
				{ path: "loc1.md", fields: {} },
				{ path: "loc2.md", fields: {} },
				{ path: "loc3.md", fields: {} },
			],
			onRowClick: vi.fn(),
		});

		const rowEls = container.querySelectorAll("[data-path]");
		expect(rowEls).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// Leading Name column (mockup S44) — entity identity + link cue
// ---------------------------------------------------------------------------

describe("buildCodexGrid — Name column", () => {
	it("renders a leading 'Name' header column", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow()],
			onRowClick: vi.fn(),
		});

		const nameHead = container.querySelector(".sf-codex-header [data-column-id='name']");
		expect(nameHead).not.toBeNull();
		expect(nameHead!.textContent).toBe("Name");
	});

	it("renders each row's name (note basename) as a link cell derived from the path", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [{ path: "30 Canon/31 Characters/Mara Stoneway.md", fields: {} }],
			onRowClick: vi.fn(),
		});

		const nameLink = container.querySelector(".sf-codex-row .sf-codex-name-link");
		expect(nameLink).not.toBeNull();
		expect(nameLink!.textContent).toBe("Mara Stoneway");
	});

	it("clicking the name cell routes onRowClick with the row path", () => {
		const container = makeContainer();
		const onRowClick = vi.fn();
		buildCodexGrid(container, {
			category: "character",
			rows: [{ path: "30 Canon/31 Characters/Mara Stoneway.md", fields: {} }],
			onRowClick,
		});

		const nameLink = container.querySelector(".sf-codex-name-link") as HTMLElement;
		nameLink.click();
		expect(onRowClick).toHaveBeenCalledWith("30 Canon/31 Characters/Mara Stoneway.md");
	});
});

// ---------------------------------------------------------------------------
// Empty state (S45)
// ---------------------------------------------------------------------------

describe("buildCodexGrid — empty state", () => {
	it("renders per-category empty-state when rows array is empty", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [],
			onRowClick: vi.fn(),
		});

		const emptyEl = container.querySelector("[data-empty-state]");
		expect(emptyEl).not.toBeNull();
		expect(emptyEl?.getAttribute("data-empty-state")).toBe("character");
	});

	it("does not render empty-state when rows are present", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow()],
			onRowClick: vi.fn(),
		});

		const emptyEl = container.querySelector("[data-empty-state]");
		expect(emptyEl).toBeNull();
	});

	it("renders different empty-state text per category", () => {
		const catA = makeContainer();
		buildCodexGrid(catA, { category: "character", rows: [], onRowClick: vi.fn() });

		const catB = makeContainer();
		buildCodexGrid(catB, { category: "scene", rows: [], onRowClick: vi.fn() });

		const emptyA = catA.querySelector("[data-empty-state]")?.textContent ?? "";
		const emptyB = catB.querySelector("[data-empty-state]")?.textContent ?? "";
		expect(emptyA).not.toBe(emptyB);
	});
});

// ---------------------------------------------------------------------------
// Click delegation
// ---------------------------------------------------------------------------

describe("buildCodexGrid — row click", () => {
	it("invokes onRowClick with the row path when a row is clicked", () => {
		const container = makeContainer();
		document.body.appendChild(container);

		const onRowClick = vi.fn();
		buildCodexGrid(container, {
			category: "character",
			rows: [{ path: "Vault/Mara.md", fields: {} }],
			onRowClick,
		});

		const rowEl = container.querySelector("[data-path='Vault/Mara.md']") as HTMLElement;
		expect(rowEl).not.toBeNull();
		rowEl.click();

		expect(onRowClick).toHaveBeenCalledTimes(1);
		expect(onRowClick).toHaveBeenCalledWith("Vault/Mara.md");

		document.body.removeChild(container);
	});

	it("invokes onRowClick only once even if a child element inside the row is clicked", () => {
		const container = makeContainer();
		document.body.appendChild(container);

		const onRowClick = vi.fn();
		buildCodexGrid(container, {
			category: "character",
			rows: [{ path: "Vault/Mara.md", fields: { role: "Hero" } }],
			onRowClick,
		});

		// Click a cell inside the row (not the row element itself)
		const cellEl = container.querySelector("[data-path] [data-cell]") as HTMLElement;
		if (cellEl) {
			cellEl.click();
			expect(onRowClick).toHaveBeenCalledTimes(1);
			expect(onRowClick).toHaveBeenCalledWith("Vault/Mara.md");
		} else {
			// fallback: click the row itself
			const rowEl = container.querySelector("[data-path='Vault/Mara.md']") as HTMLElement;
			rowEl.click();
			expect(onRowClick).toHaveBeenCalledTimes(1);
		}

		document.body.removeChild(container);
	});

	it("does not invoke onRowClick when clicking outside any row (empty area)", () => {
		const container = makeContainer();
		document.body.appendChild(container);

		const onRowClick = vi.fn();
		buildCodexGrid(container, {
			category: "character",
			rows: [],
			onRowClick,
		});

		// Click the container itself (no rows present)
		container.click();
		expect(onRowClick).not.toHaveBeenCalled();

		document.body.removeChild(container);
	});
});

// ---------------------------------------------------------------------------
// Read-only (no editable inputs)
// ---------------------------------------------------------------------------

describe("buildCodexGrid — read-only constraint", () => {
	it("renders no <input> elements in the grid", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow(), makeRow({ path: "b.md", fields: {} })],
			onRowClick: vi.fn(),
		});

		expect(container.querySelectorAll("input")).toHaveLength(0);
	});

	it("renders no <select> elements in the grid", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow()],
			onRowClick: vi.fn(),
		});

		expect(container.querySelectorAll("select")).toHaveLength(0);
	});

	it("renders no contenteditable elements in the grid", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "character",
			rows: [makeRow()],
			onRowClick: vi.fn(),
		});

		expect(container.querySelectorAll("[contenteditable]")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Unknown category — safe fallback
// ---------------------------------------------------------------------------

describe("buildCodexGrid — unknown category fallback", () => {
	it("does not crash when given an unknown category string", () => {
		const container = makeContainer();
		expect(() => {
			buildCodexGrid(container, {
				category: "unknown" as EntityKind,
				rows: [makeRow()],
				onRowClick: vi.fn(),
			});
		}).not.toThrow();
	});

	it("renders rows even for unknown category", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "unknown" as EntityKind,
			rows: [{ path: "x.md", fields: {} }],
			onRowClick: vi.fn(),
		});

		expect(container.querySelector("[data-path='x.md']")).not.toBeNull();
	});

	it("renders empty-state for unknown category with empty rows", () => {
		const container = makeContainer();
		buildCodexGrid(container, {
			category: "unknown" as EntityKind,
			rows: [],
			onRowClick: vi.fn(),
		});

		expect(container.querySelector("[data-empty-state]")).not.toBeNull();
	});
});
