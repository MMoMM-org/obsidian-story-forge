/**
 * editorSections.test.ts — T5.3 (spec 008-codex-surface, Phase 5).
 *
 * The editor pane's contents, driven purely by `FieldModel` (ADR-31): one
 * section per FileClass in chain order, base first; the width rule derived from
 * the field's type; a user's own FileClass in its own labelled section; and
 * undeclared keys in "Other properties".
 *
 * Fixtures go through the REAL `resolveFileClassChain` over raw FileClass
 * frontmatter rather than hand-built `ParsedFileClass` objects, so the OQ-1
 * `title` read and the chain ordering are exercised end to end rather than
 * assumed. The rendered assertions then run over `buildFieldModel`'s real
 * output.
 *
 * **A limit, stated rather than papered over:** jsdom computes no CSS, so
 * nothing here can verify that a `half` field actually renders two-up or that
 * a `full` one spans the row. What these tests pin is the *stamped modifier*
 * per named field — the contract `styles.css` keys the grid off. The visual
 * result is a real-vault check (T5.6), not something a DOM assertion can see.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.3
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Complex Logic (traced walkthrough)
 * @ref docs/mockups/anvil-workbench-codex.html — S102, S103
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { buildFieldModel } from "editor/fieldModel";
import { renderFieldSections } from "editor/editorPane";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import type { FileClassLookup } from "fileclass/fileClassTypes";

// ---------------------------------------------------------------------------
// Raw FileClass frontmatter, the shape metadata-menu actually writes
// ---------------------------------------------------------------------------

interface RawFileClass {
	readonly title?: string;
	readonly extends?: string;
	readonly fieldsOrder?: string[];
	readonly fields?: unknown[];
}

function field(id: string, name: string, type: string, values?: string[]): Record<string, unknown> {
	const def: Record<string, unknown> = { id, name, type };
	if (values) {
		def["options"] = { valuesList: Object.fromEntries(values.map((v, i) => [String(i + 1), v])) };
	}
	return def;
}

/** The shipped `fc-character` shape, trimmed to the fields S102/S103 name. */
const FC_CHARACTER: RawFileClass = {
	fieldsOrder: ["f-name", "f-role", "f-status", "f-occupation", "f-allies"],
	fields: [
		field("f-name", "name", "Input"),
		field("f-role", "role", "Select", ["protagonist", "supporting"]),
		field("f-status", "status", "Select", ["alive", "dead"]),
		field("f-occupation", "occupation", "Input"),
		field("f-allies", "allies", "MultiFile"),
	],
};

/** S103's user FileClass: its own `title`, extending ours. */
const FC_ISEKAI: RawFileClass = {
	title: "Isekai",
	extends: "fc-character",
	fieldsOrder: ["u-level", "u-affinity", "u-skills", "u-guild"],
	fields: [
		field("u-level", "level", "Number"),
		field("u-affinity", "affinity", "Select", ["fire", "tide"]),
		field("u-skills", "skills", "Multi"),
		field("u-guild", "guild", "MultiFile"),
	],
};

function lookupOf(classes: Readonly<Record<string, RawFileClass>>): FileClassLookup {
	return { getFileClassFrontmatter: (name: string): unknown => classes[name] };
}

// ---------------------------------------------------------------------------
// Render harness
// ---------------------------------------------------------------------------

const mounted: HTMLElement[] = [];
afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.remove();
});

function renderChain(
	startName: string,
	classes: Readonly<Record<string, RawFileClass>>,
	frontmatter: Record<string, unknown> = {},
): HTMLElement {
	const chain = resolveFileClassChain(startName, lookupOf(classes));
	const model = buildFieldModel(chain, frontmatter);
	const host = document.createElement("div");
	document.body.appendChild(host);
	mounted.push(host);
	renderFieldSections(host, model, { valueOf: (name) => frontmatter[name] ?? null });
	return host;
}

function sectionLabels(host: HTMLElement): string[] {
	return Array.from(host.querySelectorAll<HTMLElement>(".sf-ed-sec-label")).map((el) => el.textContent ?? "");
}

function sectionEls(host: HTMLElement): HTMLElement[] {
	return Array.from(host.querySelectorAll<HTMLElement>(".sf-ed-sec"));
}

function fieldNames(host: HTMLElement): string[] {
	return Array.from(host.querySelectorAll<HTMLElement>("[data-sf-ed-field]")).map(
		(el) => el.getAttribute("data-sf-ed-field") ?? "",
	);
}

/** The stamped width modifier for a named field — NOT a rendered-layout check. */
function widthOf(host: HTMLElement, name: string): string {
	const cell = host.querySelector<HTMLElement>(`[data-sf-ed-field="${name}"]`);
	if (!cell) throw new Error(`no control for ${name}`);
	return Array.from(cell.classList).find((c) => c.startsWith("sf-ed-f--")) ?? "";
}

/** The visible label rendered immediately before a named field's cell. */
function labelFor(host: HTMLElement, name: string): HTMLLabelElement | null {
	const cell = host.querySelector<HTMLElement>(`[data-sf-ed-field="${name}"]`);
	const previous = cell?.previousElementSibling;
	return previous instanceof HTMLLabelElement ? previous : null;
}

/** Field names rendered between one section heading and the next. */
function fieldsUnder(host: HTMLElement, label: string): string[] {
	const heading = sectionEls(host).find((el) => el.textContent?.includes(label));
	if (!heading) throw new Error(`no section labelled ${label}`);
	const names: string[] = [];
	let node = heading.nextElementSibling;
	while (node && !node.classList.contains("sf-ed-sec")) {
		const attr = node.getAttribute("data-sf-ed-field");
		if (attr) names.push(attr);
		node = node.nextElementSibling;
	}
	return names;
}

// ---------------------------------------------------------------------------
// Sections, order and labels (PRD/F6 AC; OQ-1)
// ---------------------------------------------------------------------------

describe("editor sections — one per FileClass, base first (T5.3)", () => {
	it("renders one section per FileClass in chain order, base first", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		// The user's FileClass extends ours, so ours renders FIRST (S103).
		expect(sectionLabels(host)).toEqual(["Character", "Isekai"]);
	});

	it("takes a section's label from the FileClass's own title key when it has one", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		// "Isekai" cannot be derived from "fc-character-custom1" — only the title
		// key produces the label S103 was signed off with.
		expect(sectionLabels(host)).toContain("Isekai");
	});

	it("still labels a section when the FileClass has NO title key (OQ-1's fallback)", () => {
		// The degradation path IS the decision: metadata-menu writes these files
		// through its own UI and may drop a key it does not know, and every
		// FileClass the plugin generates today carries no title at all. The label
		// must degrade, never vanish.
		const host = renderChain("fc-character", { "fc-character": FC_CHARACTER });

		expect(sectionLabels(host)).toEqual(["Character"]);
	});

	it("falls back when the title key is present but blank", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": { ...FC_ISEKAI, title: "   " },
		});

		// metadata-menu writes these files through its own UI; an emptied key is
		// a likelier state than a missing one, and an empty heading is worse than
		// a derived one.
		expect(sectionLabels(host)).toEqual(["Character", "Character custom1"]);
	});

	it("prettifies a multi-word file name rather than showing the raw basename", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			// Same user FileClass, minus the title key.
			"fc-character-custom1": { ...FC_ISEKAI, title: undefined },
		});

		expect(sectionLabels(host)).toEqual(["Character", "Character custom1"]);
	});

	it("names the FileClass file each section came from, and what it extends", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		const sources = Array.from(host.querySelectorAll<HTMLElement>(".sf-ed-sec-src")).map(
			(el) => el.textContent ?? "",
		);
		expect(sources[0]).toBe("fc-character.md");
		expect(sources[1]).toContain("fc-character-custom1.md");
		expect(sources[1]).toContain("extends fc-character");
	});

	it("renders section headings as real headings, not styled divs", () => {
		const host = renderChain("fc-character", { "fc-character": FC_CHARACTER });

		// The SDD's accessibility line: "the editor's section headings are real
		// headings". A <b> in a <div> announces as nothing.
		expect(sectionEls(host)[0]?.tagName).toBe("H3");
	});
});

// ---------------------------------------------------------------------------
// The user's own FileClass (PRD/F6 AC; the `origin: "user"` debt)
// ---------------------------------------------------------------------------

describe("editor sections — a user's own FileClass (T5.3)", () => {
	it("gives it its own labelled section rather than appending its fields to ours", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		expect(fieldsUnder(host, "Character")).toEqual(["name", "role", "status", "occupation", "allies"]);
		expect(fieldsUnder(host, "Isekai")).toEqual(["level", "affinity", "skills", "guild"]);
	});

	it("marks it as the user's own — in words, not by colour", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});
		const [ours, theirs] = sectionEls(host);

		// The mockup distinguishes the three origins by colour alone; colour is
		// invisible to a colour-blind or screen-reader user, so the source line
		// says it too (S103's "· yours ·").
		expect(ours?.classList.contains("sf-ed-sec--builtin")).toBe(true);
		expect(theirs?.classList.contains("sf-ed-sec--user")).toBe(true);
		expect(theirs?.textContent).toMatch(/yours/i);
		expect(ours?.textContent).not.toMatch(/yours/i);
	});

	it("treats a FileClass the plugin generates as ours, not the user's", () => {
		const host = renderChain("fc-character-fantasy", {
			"fc-character": FC_CHARACTER,
			"fc-character-fantasy": { extends: "fc-character", fieldsOrder: [], fields: [field("g-species", "species", "Select", ["Human"])] },
		});

		// `fc-character-fantasy` ships with the plugin — marking a shipped
		// FileClass as "yours" would make the distinction meaningless.
		expect(sectionEls(host).every((el) => el.classList.contains("sf-ed-sec--builtin"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The width rule (S102/S103, field-for-field)
// ---------------------------------------------------------------------------

describe("editor sections — the width rule (T5.3)", () => {
	it("stamps half width for the short types and full width for the list types", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		// S102/S103 field-for-field. NOTE: this asserts the stamped MODIFIER, not
		// the rendered geometry — jsdom computes no CSS. Whether the grid really
		// places these two-up is a real-vault check (T5.6).
		expect(widthOf(host, "name")).toBe("sf-ed-f--half");
		expect(widthOf(host, "role")).toBe("sf-ed-f--half");
		expect(widthOf(host, "status")).toBe("sf-ed-f--half");
		expect(widthOf(host, "occupation")).toBe("sf-ed-f--half");
		expect(widthOf(host, "level")).toBe("sf-ed-f--half");
		expect(widthOf(host, "affinity")).toBe("sf-ed-f--half");

		expect(widthOf(host, "skills")).toBe("sf-ed-f--full");
		expect(widthOf(host, "guild")).toBe("sf-ed-f--full");
		expect(widthOf(host, "allies")).toBe("sf-ed-f--full");
	});

	it("ties a field's label to the control it names", () => {
		const host = renderChain("fc-character", { "fc-character": FC_CHARACTER });
		const label = labelFor(host, "name");
		const input = host.querySelector<HTMLInputElement>('[data-sf-ed-field="name"] input');

		expect(label?.textContent).toBe("name");
		expect(label?.htmlFor).not.toBe("");
		expect(label?.htmlFor).toBe(input?.id);
	});

	it("starts a full-width field's label in the first column, so the pair gets its own row", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});

		// The grid is `96px 1fr 96px 1fr`, so a full-width VALUE spans 3 columns —
		// correct only when its label sits in column 1. After an ODD number of
		// half fields the label lands in column 3, the value no longer fits, and
		// sparse placement drops it to the next row, orphaning the label. Three of
		// the eight shipped FileClasses hit this (fc-scene, fc-character-fantasy,
		// fc-lore). Stamping the label is what forces a fresh row.
		// As with `sf-ed-f--full`, this asserts the MODIFIER, not the geometry.
		expect(labelFor(host, "skills")?.classList.contains("sf-ed-label--full")).toBe(true);
		expect(labelFor(host, "guild")?.classList.contains("sf-ed-label--full")).toBe(true);
		expect(labelFor(host, "allies")?.classList.contains("sf-ed-label--full")).toBe(true);

		expect(labelFor(host, "name")?.classList.contains("sf-ed-label--full")).toBe(false);
		expect(labelFor(host, "level")?.classList.contains("sf-ed-label--full")).toBe(false);
	});

	it("gives two panes over the same model distinct control ids", () => {
		const chain = resolveFileClassChain("fc-character", lookupOf({ "fc-character": FC_CHARACTER }));
		const model = buildFieldModel(chain, {});
		const first = document.createElement("div");
		const second = document.createElement("div");
		document.body.append(first, second);
		mounted.push(first, second);

		renderFieldSections(first, model, { valueOf: () => null });
		renderFieldSections(second, model, { valueOf: () => null });

		// Two Anvils can be open at once (`EditorPaneStore` exists per view for
		// exactly that reason). Shared ids would make a label click in the second
		// pane focus the FIRST pane's input.
		const firstId = first.querySelector<HTMLInputElement>('[data-sf-ed-field="name"] input')?.id;
		const secondId = second.querySelector<HTMLInputElement>('[data-sf-ed-field="name"] input')?.id;
		expect(firstId).not.toBe(secondId);
		expect(labelFor(first, "name")?.htmlFor).toBe(firstId);
		expect(labelFor(second, "name")?.htmlFor).toBe(secondId);
	});

	it("writes no `for` on a chip field, which has no labelable control", () => {
		const host = renderChain("fc-character-custom1", {
			"fc-character": FC_CHARACTER,
			"fc-character-custom1": FC_ISEKAI,
		});
		const cell = host.querySelector<HTMLElement>('[data-sf-ed-field="skills"]');

		// A Multi/MultiFile/File cell is a chip row with NO input until the entry
		// box opens, so `for` would point at an element that does not exist —
		// an unassociated label, which is worse for a screen reader than none.
		expect(cell?.querySelector("input, select, textarea")).toBeNull();
		expect(labelFor(host, "skills")?.hasAttribute("for")).toBe(false);

		// The name still reaches assistive tech, through the cell itself (T5.2).
		expect(cell?.getAttribute("role")).toBe("group");
		expect(cell?.getAttribute("aria-label")).toBe("skills");
	});
});

// ---------------------------------------------------------------------------
// Tier 3 — undeclared keys (PRD/F6 AC)
// ---------------------------------------------------------------------------

describe("editor sections — undeclared keys (T5.3)", () => {
	it("puts a key no FileClass declares in its own Other properties section", () => {
		const host = renderChain(
			"fc-character",
			{ "fc-character": FC_CHARACTER },
			{ name: "Mara Stoneway", scratch: "rewrite her introduction in ch. 3" },
		);

		expect(sectionLabels(host)).toEqual(["Character", "Other properties"]);
		expect(fieldsUnder(host, "Other properties")).toEqual(["scratch"]);
	});

	it("marks that section as neither ours nor the user's, in words", () => {
		const host = renderChain(
			"fc-character",
			{ "fc-character": FC_CHARACTER },
			{ scratch: "note to self" },
		);
		const other = sectionEls(host).at(-1);

		expect(other?.classList.contains("sf-ed-sec--other")).toBe(true);
		expect(other?.textContent).toMatch(/not declared by any FileClass/i);
	});

	it("keeps the classification keys out of it — they decide what the pane IS", () => {
		const host = renderChain(
			"fc-character",
			{ "fc-character": FC_CHARACTER },
			{ tags: ["canon/character"], fileClass: "fc-character", scratch: "note" },
		);

		// Editing `fileClass` from the editor would change which fields the
		// editor shows, and a typo would empty it; `tags` decides which
		// collection the note belongs to. S103's Other properties shows exactly
		// one key for a note that certainly has tags.
		expect(fieldsUnder(host, "Other properties")).toEqual(["scratch"]);
	});

	it("still renders a classification key that a FileClass genuinely declares", () => {
		const host = renderChain("fc-tagged", {
			"fc-tagged": { fieldsOrder: ["t-tags"], fields: [field("t-tags", "tags", "Multi")] },
		});

		// Then it is that FileClass's business, not ours to suppress.
		expect(fieldNames(host)).toEqual(["tags"]);
	});

	it("shows the note's own keys when no FileClass applies at all (tier 2)", () => {
		const host = renderChain("fc-nonexistent", {}, { name: "Mara", age: 34 });

		expect(sectionLabels(host)).toEqual(["Properties"]);
		expect(fieldNames(host)).toEqual(["name", "age"]);
	});

	it("keeps the classification keys out of tier 2 as well", () => {
		// The live path: a note with no FileClass almost always still has tags,
		// so this is the common case, not an edge one — and the tier-3 filter
		// having four watchers says nothing about this one.
		const host = renderChain(
			"fc-nonexistent",
			{},
			{ tags: ["canon/character"], fileClass: "fc-gone", name: "Mara" },
		);

		expect(fieldNames(host)).toEqual(["name"]);
	});
});

// ---------------------------------------------------------------------------
// Every dock shows the full field set (PRD/F5 AC) — through the live Anvil
// ---------------------------------------------------------------------------

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const fcCharacter = createMockTFile({ basename: "fc-character", path: "00 Meta/FileClasses/fc-character.md" });
const fcIsekai = createMockTFile({ basename: "fc-character-custom1", path: "00 Meta/FileClasses/fc-character-custom1.md" });

const NOTE_FRONTMATTER: Record<string, unknown> = {
	tags: ["canon/character"],
	fileClass: "fc-character-custom1",
	name: "Mara Stoneway",
	role: "protagonist",
	skills: ["Ember Sight"],
	scratch: "rewrite her introduction",
};

function seedVault(app: App): void {
	const caches = new Map<TFile, CachedMetadata>([
		[mara, createMockCachedMetadata({ frontmatter: NOTE_FRONTMATTER })],
		[fcCharacter, createMockCachedMetadata({ frontmatter: FC_CHARACTER as unknown as Record<string, unknown> })],
		[fcIsekai, createMockCachedMetadata({ frontmatter: FC_ISEKAI as unknown as Record<string, unknown> })],
	]);
	const byPath = new Map<string, TFile>([mara, fcCharacter, fcIsekai].map((f) => [f.path, f]));

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, fcCharacter, fcIsekai]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

async function openPaneOnMara(app: App, dock: "bottom" | "right"): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view: AnvilView = new AnvilView(leaf, {
		settings: { getCardTitleOpensNote: () => false },
		drill: (f) => { view.inspect(f); },
		editor: { getDock: () => dock },
	});
	await view.onOpen();
	view.setLayout("codex");
	view.contentEl.querySelector<HTMLElement>(`[data-sf-link="${mara.path}"]`)
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	return view;
}

function paneFieldNames(view: AnvilView): string[] {
	return Array.from(view.contentEl.querySelectorAll<HTMLElement>("[data-sf-ed-field]")).map(
		(el) => el.getAttribute("data-sf-ed-field") ?? "",
	);
}

const FULL_FIELD_SET = ["name", "role", "status", "occupation", "allies", "level", "affinity", "skills", "guild", "scratch"];

describe("editor sections — in the Anvil, every dock (T5.3, PRD/F5)", () => {
	it("shows the full field set in the bottom dock", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPaneOnMara(app, "bottom");

		expect(paneFieldNames(view)).toEqual(FULL_FIELD_SET);
	});

	it("shows the full field set in the right dock — the docks differ only in room", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPaneOnMara(app, "right");

		expect(paneFieldNames(view)).toEqual(FULL_FIELD_SET);
	});

	it("shows the full field set in fullscreen", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPaneOnMara(app, "bottom");
		view.contentEl.querySelector<HTMLElement>('[data-sf-ed-tool="fullscreen"]')
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(paneFieldNames(view)).toEqual(FULL_FIELD_SET);
	});

	it("seeds each control from the note's own frontmatter", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPaneOnMara(app, "bottom");

		const nameInput = view.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="name"] input');
		expect(nameInput?.value).toBe("Mara Stoneway");
		const chips = view.contentEl.querySelectorAll<HTMLElement>('[data-sf-ed-field="skills"] .sf-ed-chip-label');
		expect(Array.from(chips).map((c) => c.textContent)).toEqual(["Ember Sight"]);
	});
});
