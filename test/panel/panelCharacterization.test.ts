/**
 * Characterization of the three image-bearing panel kinds (T6.2, spec 008).
 *
 * Pins the exact DOM `renderPanel` produces for a character, a location and an
 * object — with and without the kind's image field — BEFORE the tile source
 * moves from a field NAME to a field TYPE. The refactor must leave these
 * byte-identical for a note with no FileClass (the native fallback, CON-3).
 *
 * Snapshots, not assertions, on purpose: "no visual regression" is a claim
 * about the whole tree, and a hand-picked assertion list would only cover the
 * parts someone thought of.
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { renderPanel, type PanelDeps } from "panel/renderPanel";
import type { EntityKind, NoteContext, ResolvedEntity } from "scoping/NoteContext";

function makeDeps(): PanelDeps {
	return {
		onOpenLink: () => {},
		collapsed: {},
		toggleCollapse: () => {},
		resolveAsset: (src: string) => (src ? `app://vault/${src}` : ""),
	};
}

function entity(field: string, basename: string, kind: ResolvedEntity["kind"], relation: ResolvedEntity["relation"]): ResolvedEntity {
	return { file: createMockTFile({ basename, path: `x/${basename}.md` }), kind, relation, field };
}

function render(activeKind: EntityKind, basename: string, frontmatter: Record<string, unknown>, extra: Partial<NoteContext> = {}): string {
	const ctx: NoteContext = {
		activeFile: createMockTFile({ basename, path: `canon/${basename}.md` }),
		activeKind,
		entities: [],
		backlinks: [],
		frontmatter,
		resolvedAt: 0,
		...extra,
	};
	const el = augmentEl(document.createElement("div"));
	renderPanel(ctx, el, makeDeps());
	return el.innerHTML;
}

const CHARACTER = {
	role: "protagonist", status: "alive", occupation: "keeper", age: 34, height: 170, build: "wiry",
	hair: "black", eyes: "grey", nickname: "Mar", tagline: "Light the lamp.",
	distinctive_features: "scar", aliases: ["M"], first_appearance: "[[Scene 1]]",
	species: "human",
};
const LOCATION = { locationType: "building", region: "North Coast", aliases: ["The Lamp"], first_appearance: "[[Scene 2]]" };
const OBJECT = { kind: "artifact", aliases: ["Lens"], first_appearance: "[[Scene 3]]" };

describe("panel output before the tile source moves to the field type (T6.2)", () => {
	it("character with a portrait", () => {
		const html = render("character", "Mara Stoneway", { ...CHARACTER, portrait: "[[95 Assets/Mara.svg]]" }, {
			entities: [entity("allies", "Tom", "character", "outgoing")],
			backlinks: [entity("pov", "Scene 1", "scene", "backlink")],
		});
		expect(html).toMatchSnapshot();
	});

	it("character without a portrait", () => {
		expect(render("character", "Mara Stoneway", CHARACTER)).toMatchSnapshot();
	});

	it("location with an image", () => {
		const html = render("location", "Moonharbor Lighthouse", { ...LOCATION, image: "[[95 Assets/Lighthouse.svg]]" }, {
			entities: [entity("world", "Moonharbor", "location", "outgoing")],
		});
		expect(html).toMatchSnapshot();
	});

	it("location without an image", () => {
		expect(render("location", "Moonharbor Lighthouse", LOCATION)).toMatchSnapshot();
	});

	it("object with an image", () => {
		expect(render("object", "The Beacon Lens", { ...OBJECT, image: "[[95 Assets/Lens.svg]]" })).toMatchSnapshot();
	});

	it("object without an image", () => {
		expect(render("object", "The Beacon Lens", OBJECT)).toMatchSnapshot();
	});
});
