/**
 * inspectorPerKind — what the Workbench editor does for each shipped kind, field
 * by field (T6.3): rendered fields and their order, editable versus read-only,
 * and what a commit actually writes. Written against the hardcoded list this
 * replaced, and passing unchanged across the switch to the real FileClasses.
 *
 * The expectations come from `schema/*.json`, read off disk, so a new kind needs
 * no change here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Component, TFile } from "../__mocks__/obsidian";
import { buildFieldModel } from "editor/fieldModel";
import { InspectorController } from "inspector/InspectorController";
import { inspectorFieldsFromModel } from "inspector/inspectorFieldsFromModel";
import type { FieldSpec } from "inspector/frontmatterWriter";
import type { EntityKind, NoteContext } from "scoping/NoteContext";
import { generatedChain, holdsLinks, loadSchemas, type EntitySchema, type SchemaField } from "../helpers/generatedFileClasses";

const EDITABLE: ReadonlySet<string> = new Set(["text", "media", "number", "select"]);

const schemas = loadSchemas().filter((schema) => schema.extends === undefined);
const named: [string, EntitySchema][] = schemas.map((schema) => [schema.entity, schema]);

function shown(schema: EntitySchema): SchemaField[] {
	return schema.fields.filter((field) => field.type !== "tags");
}

function seedValue(field: SchemaField, entity: string): unknown {
	switch (field.type) {
		case "fixed": return field.value ?? entity;
		case "media": return "[[plate.png]]";
		case "number": return 7;
		case "select": return field.values?.[0] ?? "";
		case "relation": return "[[Alpha]]";
		case "list": return holdsLinks(field) ? ["[[Alpha]]", "[[Beta]]"] : ["one", "two"];
		default: return `${field.name} value`;
	}
}

function seed(schema: EntitySchema): Record<string, unknown> {
	return Object.fromEntries(shown(schema).map((field) => [field.name, seedValue(field, schema.entity)]));
}

function fieldsFor(schema: EntitySchema): FieldSpec[] {
	return inspectorFieldsFromModel(buildFieldModel(generatedChain(schema.entity), seed(schema)));
}

function makeFile(): TFile {
	const file = new TFile();
	file.path = "30 Canon/Note.md";
	file.basename = "Note";
	return file;
}

function linkedFile(basename: string): TFile {
	const file = new TFile();
	file.path = `30 Canon/${basename}.md`;
	file.basename = basename;
	return file;
}

function mount(app: App, schema: EntitySchema): { host: HTMLElement; file: TFile } {
	const file = makeFile();
	const frontmatter = seed(schema);
	app.fileManager._setFrontmatter(file.path, frontmatter);
	const ctx: NoteContext = {
		activeFile: file,
		activeKind: schema.entity as EntityKind,
		entities: [],
		backlinks: [],
		frontmatter,
		resolvedAt: 0,
	};
	const host = document.createElement("div");
	new InspectorController(app, new Component()).render(host, ctx, fieldsFor(schema));
	return { host, file };
}

function rowOf(host: HTMLElement, name: string): HTMLElement {
	const label = host.querySelector(`[data-sf-inspector-field-label="${name}"]`);
	const row = label?.closest<HTMLElement>(".sf-inspector-field");
	if (!row) throw new Error(`no row for ${name}`);
	return row;
}

function controlOf(host: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement | null {
	return host.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-sf-inspector-input="${name}"]`);
}

async function commitValue(host: HTMLElement, name: string, value: string): Promise<void> {
	const control = controlOf(host, name);
	if (!control) throw new Error(`no control for ${name}`);
	control.value = value;
	control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
	host.querySelector<HTMLElement>(`[data-sf-inspector-commit="${name}"]`)?.click();
	await vi.waitFor(() => { expect(controlOf(host, name)?.closest(".sf-inspector-field")?.querySelector("[data-sf-inspector-commit]")).toBeNull(); }, { interval: 1 });
}

describe("InspectorController, per shipped kind (T6.3)", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) => linkedFile(link));
	});

	it("covers the seven shipped kinds", () => {
		expect(named).toHaveLength(7);
	});

	it.each(named)("%s: renders the schema's fields in schema order", (_entity, schema) => {
		const { host } = mount(app, schema);
		const labels = Array.from(host.querySelectorAll("[data-sf-inspector-field-label]"))
			.map((label) => label.textContent);
		expect(labels).toEqual(shown(schema).map((field) => field.name));
	});

	it.each(named)("%s: only scalar fields get a control, seeded from the note", (_entity, schema) => {
		const { host } = mount(app, schema);
		for (const field of shown(schema)) {
			const control = controlOf(host, field.name);
			if (EDITABLE.has(field.type)) expect(control?.value, field.name).toBe(String(seedValue(field, schema.entity)));
			else expect(control, field.name).toBeNull();
		}
	});

	it.each(named)("%s: select controls offer the schema's values in order", (_entity, schema) => {
		const { host } = mount(app, schema);
		for (const field of shown(schema).filter((candidate) => candidate.type === "select")) {
			const select = controlOf(host, field.name) as HTMLSelectElement;
			expect(select.tagName, field.name).toBe("SELECT");
			expect(Array.from(select.options).map((option) => option.value), field.name).toEqual(["", ...(field.values ?? [])]);
		}
	});

	it.each(named)("%s: read-only fields show their value, one chip per list item", (_entity, schema) => {
		const { host } = mount(app, schema);
		for (const field of shown(schema)) {
			if (EDITABLE.has(field.type)) continue;
			const row = rowOf(host, field.name);
			if (field.type === "fixed") {
				expect(row.querySelector(".sf-inspector-readonly-value")?.textContent, field.name).toBe(field.value ?? schema.entity);
			} else if (field.type === "relation") {
				expect(row.querySelectorAll(".sf-inspector-ro-chip"), field.name).toHaveLength(1);
			} else if (holdsLinks(field)) {
				expect(row.querySelectorAll(".sf-inspector-chip-link"), field.name).toHaveLength(2);
			} else {
				expect(row.querySelectorAll(".sf-inspector-chip"), field.name).toHaveLength(2);
			}
		}
	});

	it.each(named)("%s: committing a scalar writes the value in its own YAML type", async (_entity, schema) => {
		const { host, file } = mount(app, schema);
		for (const field of shown(schema).filter((candidate) => EDITABLE.has(candidate.type))) {
			const typed = field.type === "number" ? "42" : field.type === "select" ? (field.values?.[1] ?? "") : "[[changed]]";
			await commitValue(host, field.name, typed);
			const expected = field.type === "number" ? 42 : typed;
			expect(app.fileManager._getFrontmatter(file.path)[field.name], field.name).toBe(expected);
		}
	});

	it.each(named)("%s: read-only fields offer no commit affordance and nothing is written", (_entity, schema) => {
		const { host } = mount(app, schema);
		expect(host.querySelectorAll("[data-sf-inspector-commit]")).toHaveLength(0);
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});
});
