/**
 * collectionSections.test.ts — every kind's panel honours the Workbench switches (spec 008 T7.1d3;
 * mockups-library.html D3, P6, L7a).
 *
 * When the panel is handed `deps.collections`, the links it holds to built-in collections are
 * drawn as one section per Workbench-on collection (Library order, relation key on the right),
 * and the panel's own section for them goes. A collection that is off has no section and its
 * links show nowhere; a link no built-in claims stays where the panel drew it before. Pure: the
 * membership rule is a stand-in map; the vault-backed rule is covered through the real view.
 */
import { describe, expect, it } from "vitest";
import { augmentEl, createMockTFile } from "../../__mocks__/obsidian";
import type { TFile } from "obsidian";
import { renderPanel, type PanelDeps } from "panel/renderPanel";
import type { PanelCollections } from "panel/collectionSections";
import type { EntityKind, NoteContext, ResolvedEntity } from "scoping/NoteContext";

const file = (name: string): TFile => createMockTFile({ basename: name, path: `${name}.md` });
const TOBIAS = file("Tobias");
const HARBOR = file("Moonharbor");
const SEAL = file("Seal");
const OATH = file("Oath");
const DRAFT = file("Loose note");
const SCENE = file("Scene one");
const ELKE = file("Elke");
const SUBJECT = file("Subject");

const OWNER_OF: Record<string, string> = { [TOBIAS.path]: "character", [HARBOR.path]: "location", [SEAL.path]: "object", [OATH.path]: "lore", [ELKE.path]: "character" };
const ALL = [{ id: "character", label: "Characters" }, { id: "location", label: "Locations" }, { id: "object", label: "Objects" }, { id: "lore", label: "Lore" }];

function collections(on: string[] = ALL.map((c) => c.id)): PanelCollections {
	return { sections: ALL.filter((c) => on.includes(c.id)), collectionOf: (f) => OWNER_OF[f.path] ?? null };
}

const out = (f: TFile, kind: EntityKind, field: string): ResolvedEntity => ({ file: f, kind, relation: "outgoing", field });
const back = (f: TFile, kind: EntityKind, field?: string): ResolvedEntity => ({ file: f, kind, relation: "backlink", ...(field ? { field } : {}) });

function draw(kind: EntityKind, entities: ResolvedEntity[], backlinks: ResolvedEntity[], c?: PanelCollections): HTMLElement {
	const ctx: NoteContext = { activeFile: SUBJECT, activeKind: kind, entities, backlinks, frontmatter: {}, resolvedAt: 0 };
	const deps: PanelDeps = { onOpenLink: () => {}, collapsed: {}, toggleCollapse: () => {}, resolveAsset: (s) => s, ...(c ? { collections: c } : {}) };
	const el = augmentEl(document.createElement("div"));
	renderPanel(ctx, el, deps);
	return el;
}

interface Drawn { readonly label: string; readonly rows: Array<[string, string | null]> }
function sectionsOf(el: HTMLElement): Drawn[] {
	return [...el.querySelectorAll<HTMLElement>(".sf-section")].map((s) => ({
		label: s.querySelector(".sf-sec-label")?.textContent ?? "",
		rows: [...s.querySelectorAll<HTMLElement>(".sf-lrow-lnk")].map((l): [string, string | null] =>
			[l.textContent ?? "", l.parentElement?.querySelector(".sf-trail")?.textContent ?? null]),
	}));
}
const find = (el: HTMLElement, label: string): Drawn | undefined => sectionsOf(el).find((s) => s.label === label);
const labels = (el: HTMLElement): string[] => sectionsOf(el).map((s) => s.label);

interface Case {
	readonly kind: EntityKind;
	readonly entities: ResolvedEntity[];
	readonly backlinks: ResolvedEntity[];
	/** What the sections show with everything on, by label. */
	readonly sections: Record<string, Array<[string, string | null]>>;
	/** The panel's own sections that held these links before. */
	readonly own: string[];
	/** The non-member link and the panel section that keeps it. */
	readonly stray: { readonly entity: ResolvedEntity; readonly name: string };
	/** The collection id whose switch is turned off, and the label of its section. */
	readonly off: { readonly id: string; readonly label: string; readonly name: string };
}

const CASES: Case[] = [
	{
		kind: "location",
		entities: [out(TOBIAS, "character", "inhabitants")],
		backlinks: [back(HARBOR, "location", "world")],
		sections: { Characters: [["Tobias", "inhabitants"]], Locations: [["Moonharbor", "world"]] },
		own: ["Inhabitants"],
		stray: { entity: out(DRAFT, "unknown", "inhabitants"), name: "Loose note" },
		off: { id: "character", label: "Characters", name: "Tobias" },
	},
	{
		kind: "object",
		entities: [out(TOBIAS, "character", "owner")],
		backlinks: [],
		sections: { Characters: [["Tobias", "owner"]] },
		own: ["Owner"],
		stray: { entity: out(DRAFT, "unknown", "owner"), name: "Loose note" },
		off: { id: "character", label: "Characters", name: "Tobias" },
	},
	{
		kind: "scene",
		entities: [out(TOBIAS, "character", "pov"), out(ELKE, "character", "characters"), out(HARBOR, "location", "location")],
		backlinks: [],
		sections: { Characters: [["Tobias", "pov"], ["Elke", "characters"]], Locations: [["Moonharbor", "location"]] },
		own: ["Point of view"],
		stray: { entity: out(DRAFT, "unknown", "pov"), name: "Loose note" },
		off: { id: "location", label: "Locations", name: "Moonharbor" },
	},
	{
		kind: "lore",
		entities: [out(SEAL, "object", "related")],
		backlinks: [back(TOBIAS, "character", "related")],
		sections: { Characters: [["Tobias", "related"]], Objects: [["Seal", "related"]] },
		own: ["Related", "Referenced by"],
		stray: { entity: back(SCENE, "scene"), name: "Scene one" },
		off: { id: "object", label: "Objects", name: "Seal" },
	},
];

describe.each(CASES)("the $kind panel", (c) => {
	it("draws one section per Workbench-on built-in that has links, in Library order, keyed by the field", () => {
		const el = draw(c.kind, c.entities, c.backlinks, collections());

		const drawn = sectionsOf(el).filter((s) => s.label in c.sections);
		expect(drawn.map((s) => s.label)).toEqual(ALL.map((a) => a.label).filter((l) => l in c.sections));
		for (const s of drawn) expect(s.rows).toEqual(c.sections[s.label]);
	});

	it("drops its own section for links a built-in claims", () => {
		const el = draw(c.kind, c.entities, c.backlinks, collections());

		for (const own of c.own) expect(find(el, own)).toBeUndefined();
	});

	it("shows a built-in's links nowhere when its Workbench switch is off", () => {
		const on = ALL.map((a) => a.id).filter((id) => id !== c.off.id);
		const el = draw(c.kind, c.entities, c.backlinks, collections(on));

		expect(labels(el)).not.toContain(c.off.label);
		expect(el.textContent).not.toContain(c.off.name);
	});

	it("keeps a link no built-in claims in the panel's own section", () => {
		const el = draw(c.kind, [...c.entities, ...(c.stray.entity.relation === "outgoing" ? [c.stray.entity] : [])], [...c.backlinks, ...(c.stray.entity.relation === "backlink" ? [c.stray.entity] : [])], collections());

		expect(el.textContent).toContain(c.stray.name);
		const holder = sectionsOf(el).find((s) => !(s.label in c.sections) && s.rows.some((r) => r[0] === c.stray.name));
		expect(holder).toBeDefined();
	});

	it("is unchanged without a Library", () => {
		const el = draw(c.kind, c.entities, c.backlinks);

		for (const own of c.own) expect(labels(el)).toContain(own);
		expect(el.querySelectorAll(".sf-trail").length).toBeLessThanOrEqual(c.entities.length + c.backlinks.length);
	});
});

describe("the panels with no built-in links to draw", () => {
	it("a plotline lists scenes only and never gains a collection section", () => {
		const el = draw("plotline", [], [back(SCENE, "scene", "plotlines")], collections());

		expect(labels(el)).not.toEqual(expect.arrayContaining(["Characters"]));
		expect(el.textContent).toContain("Scene one");
	});

	it("a note that is both linked and linking back with one key is listed once", () => {
		const el = draw("lore", [out(TOBIAS, "character", "related")], [back(TOBIAS, "character", "related")], collections());

		expect(find(el, "Characters")?.rows).toEqual([["Tobias", "related"]]);
	});
});
