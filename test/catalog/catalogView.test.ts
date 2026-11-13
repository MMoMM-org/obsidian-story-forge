/**
 * catalogView — the pure list logic behind the catalog browser (mockups-catalog.html Q2), shaped
 * to be shared with the vault import modal (mockups-import.html L11): any item with a name, an
 * optional description and an engine.
 */

import { describe, it, expect } from "vitest";
import { filterEntries } from "catalog/catalogView";

type Engine = "bases" | "dataview-dql" | "dataviewjs";

interface Item {
	name: string;
	description?: string;
	engine: Engine;
	/** Anything else the caller carries rides along untouched. */
	path: string;
}

function item(name: string, engine: Engine, description?: string): Item {
	return { name, engine, path: `${name}.md`, ...(description !== undefined ? { description } : {}) };
}

const ITEMS: Item[] = [
	item("Character overview", "bases", "Every character with role."),
	item("Locations by region", "bases", "Places grouped by region."),
	item("Open plot threads", "dataview-dql", "Plotlines not yet resolved."),
	item("Relationship web", "dataviewjs", "Allies and rivals."),
	item("Word count", "dataviewjs"),
];

const names = (xs: Item[]): string[] => xs.map((x) => x.name);

describe("filterEntries", () => {
	it("returns every item, in order, for an empty query and the 'all' filter", () => {
		const r = filterEntries(ITEMS, "", "all");
		expect(r.shown).toEqual(ITEMS);
		expect(r.counts).toEqual({ all: 5, bases: 2, "dataview-dql": 1, dataviewjs: 2 });
	});

	it("matches the name or the description, case-insensitively, ignoring surrounding spaces", () => {
		expect(names(filterEntries(ITEMS, "  REGION ", "all").shown)).toEqual(["Locations by region"]);
		expect(names(filterEntries(ITEMS, "allies", "all").shown)).toEqual(["Relationship web"]);
	});

	it("matches an item that has no description by its name alone", () => {
		expect(names(filterEntries(ITEMS, "word", "all").shown)).toEqual(["Word count"]);
		expect(filterEntries(ITEMS, "undefined", "all").shown).toEqual([]);
	});

	it("narrows by engine on top of the search", () => {
		expect(names(filterEntries(ITEMS, "", "dataviewjs").shown)).toEqual(["Relationship web", "Word count"]);
		expect(names(filterEntries(ITEMS, "o", "bases").shown)).toEqual(["Character overview", "Locations by region"]);
	});

	it("counts the search matches per engine, whatever the engine filter is", () => {
		const r = filterEntries(ITEMS, "re", "dataview-dql");
		expect(names(r.shown)).toEqual(["Open plot threads"]);
		expect(r.counts).toEqual({ all: 3, bases: 1, "dataview-dql": 1, dataviewjs: 1 });
	});

	it("leaves an engine with no matches out of the counts (callers read it as 0)", () => {
		const r = filterEntries(ITEMS, "timeline", "all");
		expect(r.shown).toEqual([]);
		expect(r.counts).toEqual({ all: 0 });
	});

	it("keeps the caller's own item objects", () => {
		expect(filterEntries(ITEMS, "web", "all").shown[0]).toBe(ITEMS[3]);
	});
});
