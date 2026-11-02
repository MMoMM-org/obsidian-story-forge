/**
 * fieldControls.test.ts — T5.2 (spec 008-codex-surface, Phase 5).
 *
 * One control per metadata-menu field type, plus the two things this task owns
 * that are not "render a widget":
 *
 *  1. **The `editableField` marker's first producer.** Phase 2 resolved and
 *     unit-tested that kind in `navigationController.ts`, but no host ever
 *     emitted it — the F2 matrix row was green while unreachable from any real
 *     click. So the marker tests here go through the REAL ancestor walk, the
 *     REAL `MARKER_VOCABULARY`, the host's REAL `ANVIL_MARKERS` whitelist and
 *     the REAL controller, and one goes through a live `AnvilView` click.
 *     Asserting the attribute is stamped would reproduce the exact defect this
 *     task exists to fix.
 *
 *  2. **The out-of-list `Select`** (reconciled 2026-08-05). `offers` and
 *     `displays` name different sets: selectable is the declared list exactly,
 *     displayed is the declared list plus the current value, marked and NOT
 *     re-selectable. Both directions are asserted separately below, because the
 *     whole reconciliation is that the two sets differ.
 *
 * T5.2 writes nothing (CON-1): controls render and report through `onEdit`;
 * the commit path is T5.4.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.2
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Features F2, F5, F6
 * @ref docs/mockups/anvil-workbench-codex.html — S102, S103
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import {
	CHIP_ADD_ATTR,
	CHIP_INPUT_ATTR,
	CHIP_REMOVE_ATTR,
	FIELD_CONTROL_ATTR,
	renderFieldControl,
	type FieldValue,
} from "editor/fieldControls";
import { buildFieldModel, type FieldDef } from "editor/fieldModel";
import type { FieldType } from "fileclass/fileClassTypes";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import { ANVIL_MARKERS, createMarkerKindOf } from "navigation/markerVocabulary";
import { createNavigationController, type NavigationAction } from "navigation/navigationController";
import { CODEX_CARD_BODY_ATTR } from "codex/codexTab";

// ---------------------------------------------------------------------------
// Factories — `FieldDef` is imported, never redefined, so a model change is a
// compile error here rather than silent drift.
// ---------------------------------------------------------------------------

function fieldDef(overrides: Partial<FieldDef> = {}): FieldDef {
	return { name: "role", type: "Input", width: "half", ...overrides };
}

interface Rendered {
	/** The marker-carrying control cell. */
	readonly el: HTMLElement;
	/** The value the control would report to the commit path (T5.4). */
	value(): FieldValue;
	/** Every edit the control reported, in order. */
	readonly edits: FieldValue[];
}

/**
 * Mounted hosts. Focus only moves to a CONNECTED element (in jsdom and in a
 * browser), so every control here is rendered into the document and removed
 * afterwards — a detached host would make every focus assertion vacuous.
 */
const mounted: HTMLElement[] = [];
afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.remove();
});

function render(field: FieldDef, value: unknown = null): Rendered {
	const host = document.createElement("div");
	document.body.appendChild(host);
	mounted.push(host);
	const edits: FieldValue[] = [];
	const handle = renderFieldControl(host, field, value, {
		onEdit: (change) => { edits.push(change.value); },
	});
	return { el: handle.el, value: () => handle.value(), edits };
}

function inputIn(el: HTMLElement): HTMLInputElement {
	const input = el.querySelector("input");
	if (!input) throw new Error("no input in control");
	return input;
}

function selectIn(el: HTMLElement): HTMLSelectElement {
	const select = el.querySelector("select");
	if (!select) throw new Error("no select in control");
	return select;
}

/** Values the control OFFERS — options a user can actually choose. */
function selectableValues(el: HTMLElement): string[] {
	return Array.from(selectIn(el).options).filter((o) => !o.disabled).map((o) => o.value);
}

/** Values the control SHOWS — every option, choosable or not. */
function displayedValues(el: HTMLElement): string[] {
	return Array.from(selectIn(el).options).map((o) => o.value);
}

function chipLabels(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll<HTMLElement>(".sf-ed-chip-label")).map(
		(c) => c.textContent ?? "",
	);
}

function click(el: Element | null | undefined): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/**
 * Type into an input and fire the event a real keystroke fires — `input`, and
 * ONLY `input`. A scalar box reports on `change` (blur/Enter), so typing alone
 * must not report anything; `settle` below is what a real blur or Enter does.
 */
function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Leave the box — the `change` a browser fires on blur or Enter when the value moved. */
function settle(input: HTMLInputElement): void {
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

function pressEnter(input: HTMLInputElement): void {
	press(input, "Enter");
}

/** Press a key on any element — chips are `role="button"`, not inputs. */
function press(el: Element | null | undefined, key: string): void {
	if (!el) throw new Error("no element to press");
	el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

// ---------------------------------------------------------------------------
// One control per type (PRD/F6 AC)
// ---------------------------------------------------------------------------

describe("field controls — one per type (T5.2)", () => {
	it("renders a text input for Input, carrying the current value", () => {
		const c = render(fieldDef({ name: "occupation", type: "Input" }), "harbour warden");

		expect(inputIn(c.el).type).toBe("text");
		expect(inputIn(c.el).value).toBe("harbour warden");
	});

	it("renders a number input for Number", () => {
		const c = render(fieldDef({ name: "age", type: "Number" }), 34);

		expect(inputIn(c.el).type).toBe("number");
		expect(inputIn(c.el).value).toBe("34");
		expect(c.value()).toBe(34);
	});

	it("renders a checkbox for Boolean, reflecting the stored value", () => {
		const on = render(fieldDef({ name: "alive", type: "Boolean" }), true);
		const off = render(fieldDef({ name: "alive", type: "Boolean" }), false);

		expect(inputIn(on.el).type).toBe("checkbox");
		expect(inputIn(on.el).checked).toBe(true);
		expect(inputIn(off.el).checked).toBe(false);
	});

	it("renders a date input for Date", () => {
		const c = render(fieldDef({ name: "born", type: "Date" }), "1998-04-02");

		expect(inputIn(c.el).type).toBe("date");
		expect(inputIn(c.el).value).toBe("1998-04-02");
	});

	it.each<[FieldType, string, string]>([
		["Date", "date", "1998-04-02"],
		["Datetime", "datetime-local", "1998-04-02T09:30"],
		["Time", "time", "09:30"],
	])("keeps the native %s input for a value it can show", (type_, expected, stored) => {
		const c = render(fieldDef({ name: "when", type: type_ }), stored);

		expect(inputIn(c.el).type).toBe(expected);
		expect(inputIn(c.el).value).toBe(stored);
	});

	it.each<[FieldType, string]>([
		["Date", "April 2nd, 1998"],
		["Date", "1998-13-45"],
		["Datetime", "1998-04-02T09:30:00Z"],
		["Time", "half past nine"],
	])("falls back to a text box showing a %s value the native input cannot parse: %s", (type_, stored) => {
		const c = render(fieldDef({ name: "when", type: type_ }), stored);

		expect(inputIn(c.el).type).toBe("text");
		expect(inputIn(c.el).value).toBe(stored);
	});

	it("reports an edit made in the fallback text box as the plain string typed", () => {
		const c = render(fieldDef({ name: "born", type: "Date" }), "April 2nd, 1998");
		const box = inputIn(c.el);

		box.value = "1998-04-02";
		box.dispatchEvent(new Event("change", { bubbles: true }));

		expect(c.edits).toEqual(["1998-04-02"]);
	});

	it("leaves an empty date empty rather than falling back", () => {
		const c = render(fieldDef({ name: "born", type: "Date" }), null);
		expect(inputIn(c.el).type).toBe("date");
	});

	it("renders a select offering exactly the declared values for Select", () => {
		const c = render(
			fieldDef({ name: "role", type: "Select", values: ["protagonist", "supporting"] }),
			"protagonist",
		);

		expect(selectIn(c.el).value).toBe("protagonist");
		// "" is the explicit "no value" entry (a field can be cleared); it is not
		// an undeclared VALUE the control offers.
		expect(selectableValues(c.el)).toEqual(["", "protagonist", "supporting"]);
	});

	it("renders link chips for MultiFile, one per stored wikilink", () => {
		const c = render(
			fieldDef({ name: "allies", type: "MultiFile", width: "full" }),
			["[[Tobias Ferro]]", "[[Elke Stoneway]]"],
		);

		expect(chipLabels(c.el)).toEqual(["Tobias Ferro", "Elke Stoneway"]);
		expect(c.value()).toEqual(["[[Tobias Ferro]]", "[[Elke Stoneway]]"]);
	});

	it("renders a single link chip for File", () => {
		const c = render(fieldDef({ name: "book", type: "File" }), "[[Wardens of Moonharbor]]");

		expect(chipLabels(c.el)).toEqual(["Wardens of Moonharbor"]);
		expect(c.value()).toBe("[[Wardens of Moonharbor]]");
	});

	it("renders plain chips for Multi — values are not wikilinks", () => {
		const c = render(
			fieldDef({ name: "skills", type: "Multi", width: "full" }),
			["shortblade", "ember sight"],
		);

		expect(chipLabels(c.el)).toEqual(["shortblade", "ember sight"]);
		expect(c.value()).toEqual(["shortblade", "ember sight"]);
	});

	it.each<[FieldType, string]>([
		["Cycle", "select"],
		["Datetime", "datetime-local"],
		["Time", "time"],
	])("renders an appropriate control for the remaining declared type %s", (type_, expected) => {
		const c = render(fieldDef({ name: "when", type: type_, values: ["a", "b"] }), null);

		// `selectIn`/`inputIn` throw when absent, so reaching the assertion is
		// itself the existence check.
		if (expected === "select") expect(selectIn(c.el).tagName).toBe("SELECT");
		else expect(inputIn(c.el).type).toBe(expected);
	});

	it.each<FieldType>(["Input", "Number", "Boolean", "Date", "Select", "Multi", "MultiFile", "File"])(
		"labels the %s control, and its cell, for assistive technology",
		(type_) => {
			const c = render(fieldDef({ name: "occupation", type: type_, values: ["a"] }), null);

			// The cell is what a screen reader lands on from the marker walk, and
			// the inner control is what it lands on from the tab order — both need
			// the field's name.
			expect(c.el.getAttribute("aria-label")).toBe("occupation");
			// ...and the cell needs a role for that label to be announced at all —
			// the same rule as the inner element below, applied to the element the
			// marker walk actually lands on.
			expect(c.el.hasAttribute("role")).toBe(true);
			const labelled = c.el.querySelector("[aria-label]");
			expect(labelled?.getAttribute("aria-label")).toBe("occupation");

			// ...and the label has to be one assistive tech will actually read: a
			// form control carries its own name, a plain <div> needs a role or the
			// aria-label is ignored outright.
			const named = ["INPUT", "SELECT", "TEXTAREA"].includes(labelled?.tagName ?? "");
			expect(named || labelled?.hasAttribute("role")).toBe(true);
		},
	);

	it("stamps the declared width so the layout task can key off it", () => {
		// T5.3 places these cells two-up or full-width from this class alone
		// (styles.css says so outright). Its only precondition lives here.
		expect(render(fieldDef({ width: "half" })).el.classList.contains("sf-ed-f--half")).toBe(true);
		expect(render(fieldDef({ width: "full" })).el.classList.contains("sf-ed-f--full")).toBe(true);
	});

	it("reports null, not an empty string, when a value is cleared", () => {
		const c = render(fieldDef({ name: "occupation", type: "Input" }), "harbour warden");

		type(inputIn(c.el), "");
		settle(inputIn(c.el));

		// T5.4's commit path keys off exactly this: null deletes the key, "" writes
		// an empty Property. They are different edits to the file.
		expect(c.value()).toBeNull();
		expect(c.edits.at(-1)).toBeNull();
	});

	it("reports null, not zero, when a number is cleared", () => {
		const c = render(fieldDef({ name: "age", type: "Number" }), 34);

		type(inputIn(c.el), "");
		settle(inputIn(c.el));

		// `Number("")` is 0, so an unguarded read turns "the user emptied this
		// box" into "the user set it to zero" — and T5.4 would write `age: 0`
		// into the note instead of deleting the key. The text branch has its own
		// guard and its own test; this is the numeric twin.
		expect(c.value()).toBeNull();
		expect(c.edits.at(-1)).toBeNull();
	});

	it("reads a Boolean stored as the string \"true\"", () => {
		// YAML `alive: \"true\"` is a string, and a note written by hand or by
		// another plugin may well hold one. The checkbox must still read as on.
		expect(inputIn(render(fieldDef({ name: "alive", type: "Boolean" }), "true").el).checked).toBe(true);
		expect(inputIn(render(fieldDef({ name: "alive", type: "Boolean" }), "false").el).checked).toBe(false);
	});
});

describe("field controls — an undeclared list of [[links]]", () => {
	it("renders link chips that navigate, as a declared MultiFile does", () => {
		const links = ["[[Tobias Ferro]]", "[[Elke Stoneway]]"];
		const def = buildFieldModel([], { allies: links }).sections[0]?.fields[0] as FieldDef;
		const c = render(def, links);
		const targets = Array.from(c.el.querySelectorAll(".sf-ed-chip-label")).map((l) => l.getAttribute("data-sf-link"));

		expect(targets).toEqual(["Tobias Ferro", "Elke Stoneway"]);
	});
});

describe("field controls — a declared list field holding non-strings", () => {
	it("shows [1,2] as read-only JSON and offers no chip to rewrite it as strings", () => {
		const chain = [{ name: "fc-x", fields: [{ id: "f", name: "scores", type: "Multi" as const }] }];
		const def = buildFieldModel(chain, { scores: [1, 2] }).sections[0]?.fields[0] as FieldDef;
		const c = render(def, [1, 2]);

		expect(inputIn(c.el).readOnly).toBe(true);
		expect(inputIn(c.el).value).toBe("[1,2]");
		expect(c.el.querySelector(`[${CHIP_REMOVE_ATTR}]`)).toBeNull();
	});
});

describe("field controls — an empty list in a declared scalar field counts as unset", () => {
	function modelDef(type: FieldType, values?: string[]): FieldDef {
		const chain = [{ name: "fc-x", fields: [{ id: "f", name: "subject", type, ...(values ? { values } : {}) }] }];
		return buildFieldModel(chain, { subject: [] }).sections[0]?.fields[0] as FieldDef;
	}

	it("keeps a Number box, a checkbox and a Select, each empty", () => {
		const number = render(modelDef("Number"), []);
		const boolean = render(modelDef("Boolean"), []);
		const select = render(modelDef("Select", ["a", "b"]), []);

		expect(inputIn(number.el).type).toBe("number");
		expect(inputIn(boolean.el).type).toBe("checkbox");
		expect(selectIn(select.el).value).toBe("");
		expect(selectableValues(select.el)).toEqual(["", "a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// When a scalar control reports (user ruling, 2026-08-06)
// ---------------------------------------------------------------------------

describe("field controls — a scalar box reports when it settles, not per keystroke", () => {
	// T5.2 bound `input` here. Once T5.4 turned a report into a vault write that
	// became one write per character — and, because those writes were issued
	// unserialized, a file that could settle on an intermediate value. Undo is out
	// of scope (#17) and this phase forbids making writes easy to trigger by
	// accident, so the trigger moved to `change` (blur/Enter).
	it.each<[FieldType, string, string]>([
		["Input", "harbour warden", "harbour pilot"],
		["Number", "34", "35"],
		["Date", "1998-04-02", "1999-05-03"],
	])("stays silent while the user types into a %s box", (type_, from, to) => {
		const c = render(fieldDef({ name: "f", type: type_ }), from);

		type(inputIn(c.el), to);

		expect(c.edits).toEqual([]);
	});

	it.each<[FieldType, string, string, FieldValue]>([
		["Input", "harbour warden", "harbour pilot", "harbour pilot"],
		["Number", "34", "35", 35],
		["Date", "1998-04-02", "1999-05-03", "1999-05-03"],
	])("reports the %s box's value once it settles", (type_, from, to, expected) => {
		const c = render(fieldDef({ name: "f", type: type_ }), from);

		type(inputIn(c.el), to);
		settle(inputIn(c.el));

		expect(c.edits).toEqual([expected]);
	});

	it("reports once for a whole typed word, not once per character", () => {
		const c = render(fieldDef({ name: "name", type: "Input" }), "");

		// What a real six-keystroke edit looks like at the DOM.
		for (const partial of ["M", "Ma", "Mar", "Marc", "Marcu", "Marcus"]) {
			type(inputIn(c.el), partial);
		}
		settle(inputIn(c.el));

		// One report, carrying the FINAL value. Per-keystroke reporting produced
		// six writes whose completion order was not guaranteed, so the file could
		// settle on "Marcu".
		expect(c.edits).toEqual(["Marcus"]);
	});

	it("still reports a checkbox and a select on their own change, untouched by the above", () => {
		const box = render(fieldDef({ name: "alive", type: "Boolean" }), false);
		inputIn(box.el).checked = true;
		inputIn(box.el).dispatchEvent(new Event("change", { bubbles: true }));

		const enum_ = render(fieldDef({ name: "role", type: "Select", values: ["a", "b"] }), "a");
		selectIn(enum_.el).value = "b";
		selectIn(enum_.el).dispatchEvent(new Event("change", { bubbles: true }));

		// These two were already discrete and were deliberately NOT changed; the
		// assertion exists so "moved the scalar binding" cannot quietly become
		// "moved every binding".
		expect(box.edits).toEqual([true]);
		expect(enum_.edits).toEqual(["b"]);
	});
});

// ---------------------------------------------------------------------------
// Fallback (PRD/F6 AC — "falls back to plain text rather than failing")
// ---------------------------------------------------------------------------

describe("field controls — a value no control can represent (read-only)", () => {
	it("shows the value as text in a read-only box that reports nothing, even when poked", () => {
		const c = render(fieldDef({ name: "meta", type: "Unknown", readOnly: true }), { nested: true, n: [1, 2] });
		const box = inputIn(c.el);

		expect(box.readOnly).toBe(true);
		expect(box.value).toBe('{"nested":true,"n":[1,2]}');

		box.value = "overwritten";
		box.dispatchEvent(new Event("input", { bubbles: true }));
		box.dispatchEvent(new Event("change", { bubbles: true }));
		expect(c.edits).toEqual([]);
	});

	it.each([
		["a declared Select", [{ name: "fc-x", fields: [{ id: "t", name: "type", type: "Select" as const, values: ["character"] }] }]],
		["a declared Input", [{ name: "fc-x", fields: [{ id: "t", name: "type", type: "Input" as const }] }]],
		["tier 2 and 3, no declaration", []],
	])("shows a note's `type` as read-only text with its value, %s", (_label, chain) => {
		const model = buildFieldModel(chain, { type: "character" });
		const def = model.sections.flatMap((section) => section.fields).find((field) => field.name === "type");
		const c = render(def as FieldDef, "character");
		const box = inputIn(c.el);

		expect(c.el.querySelector("select")).toBeNull();
		expect(box.readOnly).toBe(true);
		expect(box.value).toBe("character");
	});

	it("shows a map held by a declared Number as JSON text, and reports nothing", () => {
		const chain = [{ name: "fc-x", fields: [{ id: "s", name: "stats", type: "Number" as const }] }];
		const def = buildFieldModel(chain, { stats: { str: 3 } }).sections[0]?.fields[0] as FieldDef;
		const c = render(def, { str: 3 });
		const box = inputIn(c.el);

		expect(box.readOnly).toBe(true);
		expect(box.value).toBe('{"str":3}');
		box.dispatchEvent(new Event("change", { bubbles: true }));
		expect(c.edits).toEqual([]);
	});

	it("shows an empty value as an empty box, not the word null", () => {
		expect(inputIn(render(fieldDef({ name: "type", readOnly: true }), null).el).value).toBe("");
	});

	it("shows a list of numbers whole, not as an empty box", () => {
		const c = render(fieldDef({ name: "scores", type: "Unknown", readOnly: true }), [1, 2]);
		expect(inputIn(c.el).value).toBe("[1,2]");
	});
});

describe("field controls — unsupported types (T5.2)", () => {
	it("falls back to a plain text control for an unknown type, preserving the value", () => {
		const c = render(fieldDef({ name: "mystery", type: "Unknown" }), "kept");

		expect(inputIn(c.el).type).toBe("text");
		expect(inputIn(c.el).value).toBe("kept");
	});

	it("falls back rather than throwing for a type the plugin has never heard of", () => {
		// A FileClass written by a newer metadata-menu, or a computed type the
		// PRD puts out of scope (Lookup/Formula/Canvas): render something, never
		// break the pane.
		const exotic = "Lookup" as FieldType;

		expect(() => render(fieldDef({ name: "computed", type: exotic }), "42")).not.toThrow();
		expect(inputIn(render(fieldDef({ name: "computed", type: exotic }), "42").el).type).toBe("text");
	});
});

// ---------------------------------------------------------------------------
// The out-of-list Select (reconciled 2026-08-05 — do not re-derive)
// ---------------------------------------------------------------------------

describe("field controls — a Select holding a value it does not declare (T5.2)", () => {
	const declared = ["protagonist", "supporting"];

	it("displays the current value, marked, and keeps it selected", () => {
		const c = render(
			fieldDef({ name: "role", type: "Select", values: [...declared] }),
			"antagonist",
		);

		// Displayed: declared + the current value. Without this the control shows
		// NO selection while the file holds a value — the state most likely to be
		// clicked away.
		expect(displayedValues(c.el)).toEqual(["", ...declared, "antagonist"]);
		expect(selectIn(c.el).value).toBe("antagonist");

		// Marked visibly, not by colour alone (the T5.1 accessibility bar).
		const outOfList = Array.from(selectIn(c.el).options).find((o) => o.value === "antagonist");
		expect(outOfList?.textContent).toContain("antagonist");
		expect(outOfList?.textContent).toMatch(/not in list/i);
	});

	it("never offers it: selectable is the declared list exactly, and it cannot be re-selected", () => {
		const c = render(
			fieldDef({ name: "role", type: "Select", values: [...declared] }),
			"antagonist",
		);

		// The two sets differ — that is the whole reconciliation.
		expect(selectableValues(c.el)).toEqual(["", ...declared]);
		expect(selectableValues(c.el)).not.toContain("antagonist");

		// Once the user leaves the out-of-list value they cannot re-enter it
		// THROUGH THE CONTROL, so the plugin never authors a value it does not
		// declare.
		const select = selectIn(c.el);
		select.value = "supporting";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		expect(c.value()).toBe("supporting");

		expect(Array.from(select.options).find((o) => o.value === "antagonist")?.disabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Relation chips (PRD/F5 AC — the gap that motivated this spec)
// ---------------------------------------------------------------------------

describe("field controls — relation chips (T5.2)", () => {
	it("removes a link and reports the remaining list", () => {
		const c = render(
			fieldDef({ name: "allies", type: "MultiFile", width: "full" }),
			["[[Tobias Ferro]]", "[[Elke Stoneway]]"],
		);

		click(c.el.querySelectorAll(`[${CHIP_REMOVE_ATTR}]`)[0]);

		expect(chipLabels(c.el)).toEqual(["Elke Stoneway"]);
		expect(c.value()).toEqual(["[[Elke Stoneway]]"]);
		expect(c.edits.at(-1)).toEqual(["[[Elke Stoneway]]"]);
	});

	it("adds a link as a wikilink a human could have typed", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		expect(entry).not.toBeNull();
		type(entry!, "Elke Stoneway");
		pressEnter(entry!);

		// Exactly what a person typing into the note's frontmatter would write —
		// no path, no display alias, no escaping.
		expect(c.value()).toEqual(["[[Elke Stoneway]]"]);
		expect(chipLabels(c.el)).toEqual(["Elke Stoneway"]);
	});

	it("adds a plain value for Multi — brackets belong to link fields only", () => {
		const c = render(fieldDef({ name: "skills", type: "Multi", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		type(entry!, "shortblade");
		pressEnter(entry!);

		expect(c.value()).toEqual(["shortblade"]);
	});

	it("ignores an empty entry rather than adding a blank chip", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		type(entry!, "   ");
		pressEnter(entry!);

		expect(c.value()).toEqual([]);
		expect(chipLabels(c.el)).toEqual([]);
	});

	it("reports a File as a scalar, not as a one-element list", () => {
		const c = render(fieldDef({ name: "book", type: "File" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		type(entry!, "Wardens of Moonharbor");
		pressEnter(entry!);

		// `value()` and the reported edit must agree, or T5.4 would write a list
		// into a field the rest of the plugin reads as a single link.
		expect(c.value()).toBe("[[Wardens of Moonharbor]]");
		expect(c.edits.at(-1)).toBe("[[Wardens of Moonharbor]]");
	});

	it("offers no second link for File until the first is removed", () => {
		const c = render(fieldDef({ name: "book", type: "File" }), "[[Wardens of Moonharbor]]");

		// A File holds one link. Letting a user add a second would show state the
		// control cannot write — only the first would ever reach the file.
		expect(c.el.querySelector(`[${CHIP_ADD_ATTR}]`)).toBeNull();

		click(c.el.querySelector(`[${CHIP_REMOVE_ATTR}]`));

		expect(c.value()).toBeNull();
		expect(c.el.querySelector(`[${CHIP_ADD_ATTR}]`)).not.toBeNull();
	});

	it("removes a chip from the keyboard — the × announces itself as a button", () => {
		const c = render(
			fieldDef({ name: "allies", type: "MultiFile", width: "full" }),
			["[[Tobias Ferro]]", "[[Elke Stoneway]]"],
		);
		const remove = c.el.querySelectorAll(`[${CHIP_REMOVE_ATTR}]`)[0];
		expect(remove?.getAttribute("role")).toBe("button");

		press(remove, "Enter");

		// It carries role="button" and tabindex="0", so a keyboard user can reach
		// it; if it only listens for `click` they can reach it and not use it.
		expect(c.value()).toEqual(["[[Elke Stoneway]]"]);
	});

	it("returns focus to the cell after a keyboard removal, not to nowhere", () => {
		const c = render(
			fieldDef({ name: "allies", type: "MultiFile", width: "full" }),
			["[[Tobias Ferro]]", "[[Elke Stoneway]]"],
		);
		const remove = c.el.querySelector<HTMLElement>(`[${CHIP_REMOVE_ATTR}]`);
		remove?.focus();

		press(remove, "Enter");

		// The × the user just operated is gone from the DOM, so focus has to be
		// placed deliberately — nothing else can. The host's router cannot do it
		// either: a marker walk from a detached node finds nothing (measured).
		// Without this a keyboard user lands on <body> in the middle of editing.
		expect(document.activeElement).toBe(c.el);
	});

	it("removes a chip with Space as well as Enter", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), ["[[Tobias Ferro]]"]);

		press(c.el.querySelector(`[${CHIP_REMOVE_ATTR}]`), " ");

		expect(c.value()).toEqual([]);
	});

	it("opens the entry box from the keyboard, and focuses it", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		press(c.el.querySelector(`[${CHIP_ADD_ATTR}]`), "Enter");

		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		expect(entry).not.toBeNull();
		// Focus is the whole point of revealing it: without it a keyboard user
		// opens a box they then cannot type into, and a mouse user has to click
		// twice. Asserted with no host present, so nothing else can be doing it.
		expect(document.activeElement).toBe(entry);
	});

	it("focuses the entry box when opened by click, with no host router involved", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));

		expect(document.activeElement).toBe(c.el.querySelector(`[${CHIP_INPUT_ATTR}]`));
	});

	it("opens only one entry box however often the affordance is used", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));

		expect(c.el.querySelectorAll(`[${CHIP_INPUT_ATTR}]`)).toHaveLength(1);
	});

	it("cancels the entry box on Escape, adding nothing", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);
		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		type(entry!, "Elke Stoneway");

		press(entry, "Escape");

		expect(c.el.querySelector(`[${CHIP_INPUT_ATTR}]`)).toBeNull();
		expect(c.value()).toEqual([]);
		expect(c.edits).toEqual([]);
	});

	it("skips a null entry in a stored list rather than rendering a blank chip", () => {
		// A YAML list with an empty item (`- `) parses to null. Rendering it would
		// give the user a chip they cannot read and cannot explain.
		const c = render(
			fieldDef({ name: "allies", type: "MultiFile", width: "full" }),
			["[[Tobias Ferro]]", null],
		);

		expect(chipLabels(c.el)).toEqual(["Tobias Ferro"]);
		expect(c.value()).toEqual(["[[Tobias Ferro]]"]);
	});

	it("does not double-bracket a name the user typed with brackets", () => {
		const c = render(fieldDef({ name: "allies", type: "MultiFile", width: "full" }), []);

		click(c.el.querySelector(`[${CHIP_ADD_ATTR}]`));
		const entry = c.el.querySelector<HTMLInputElement>(`[${CHIP_INPUT_ATTR}]`);
		type(entry!, "[[Elke Stoneway]]");
		pressEnter(entry!);

		expect(c.value()).toEqual(["[[Elke Stoneway]]"]);
	});
});

// ---------------------------------------------------------------------------
// The editableField marker — end to end, never "the attribute is stamped"
// ---------------------------------------------------------------------------

/** Resolve a real click the way a host does: real walk, real vocabulary, real controller. */
function resolveClick(root: HTMLElement, target: HTMLElement): { action: NavigationAction; inspected: boolean } {
	let inspected = false;
	const { markers } = walkTargetMarkers(target, root, createMarkerKindOf(ANVIL_MARKERS));
	const outcome = createNavigationController({
		getLinkClickAction: (): "drill" => "drill",
		inspect: (): void => { inspected = true; },
	}).handle(markers, false);
	return { action: outcome.action, inspected };
}

describe("field controls — the editableField marker (T5.2, PRD/F2)", () => {
	it("resolves a click on a rendered control to focusField", () => {
		const root = document.createElement("div");
		const handle = renderFieldControl(root, fieldDef({ name: "role", type: "Input" }), "x", {});

		const outcome = resolveClick(root, inputIn(handle.el));

		expect(outcome.action).toBe("focusField");
	});

	it("resolves to neither inspect nor open-note", () => {
		const root = document.createElement("div");
		const handle = renderFieldControl(root, fieldDef({ name: "role", type: "Input" }), "x", {});

		const outcome = resolveClick(root, inputIn(handle.el));

		expect(outcome.inspected).toBe(false);
		expect(outcome.action).not.toBe("openNote");
		expect(outcome.action).not.toBe("inspect");
	});

	it("wins over a card body it is nested inside — precedence is proximity (ADR-28)", () => {
		const root = document.createElement("div");
		const card = document.createElement("div");
		card.setAttribute(CODEX_CARD_BODY_ATTR, "30 Canon/Mara.md");
		root.appendChild(card);
		const handle = renderFieldControl(card, fieldDef({ name: "role", type: "Input" }), "x", {});

		const outcome = resolveClick(root, inputIn(handle.el));

		// A card body resolves to inspect on a plain click; the nearer control
		// must win, or editing inside a card would navigate away instead.
		expect(outcome.action).toBe("focusField");
		expect(outcome.inspected).toBe(false);
	});

	it("wins over a section header it is nested inside", () => {
		const root = document.createElement("div");
		const header = document.createElement("div");
		header.setAttribute("data-sf-section-toggle", "");
		root.appendChild(header);
		const handle = renderFieldControl(header, fieldDef({ name: "role", type: "Input" }), "x", {});

		expect(resolveClick(root, inputIn(handle.el)).action).toBe("focusField");
	});

	it("is recognised by the Anvil's own whitelist, not merely by the vocabulary", () => {
		// `MARKER_VOCABULARY` knowing the attribute is not enough: a host that
		// does not list it reports `null` and the click resolves to "none".
		expect(ANVIL_MARKERS).toContain(FIELD_CONTROL_ATTR);
	});
});

// ---------------------------------------------------------------------------
// ...and through a live AnvilView click (the host's own router)
// ---------------------------------------------------------------------------

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });

function seedVault(app: App): void {
	const cache: CachedMetadata = createMockCachedMetadata({ frontmatter: { tags: ["canon/character"] } });
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => (f === mara ? cache : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara] as TFile[]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? mara : null));
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

describe("field controls — inside the live editor pane (T5.2)", () => {
	it("focuses the control and opens nothing when clicked in the Anvil", async () => {
		const app = new App();
		seedVault(app);
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = app;
		const view: AnvilView = new AnvilView(leaf, { settings: { getCardTitleOpensNote: () => false }, drill: (f) => { view.inspect(f); } });
		await view.onOpen();
		view.setLayout("codex");
		document.body.appendChild(view.contentEl);
		try {
			click(view.contentEl.querySelector(`[data-sf-link="${mara.path}"]`));
			const fieldsEl = view.contentEl.querySelector<HTMLElement>(".sf-ed-grid");
			expect(fieldsEl).not.toBeNull();

			// T5.3 fills `fieldsEl` from the FieldModel; this task owns what goes
			// IN it, so the test mounts one control the way T5.3 will and clicks
			// it through the host's real delegated router.
			const handle = renderFieldControl(fieldsEl!, fieldDef({ name: "role", type: "Input" }), "protagonist", {});
			const input = inputIn(handle.el);
			click(input);

			// focusField enacted: the control is focused, and the click neither
			// re-targeted a leaf nor collapsed the pane.
			expect(view.contentEl.ownerDocument.activeElement).toBe(input);
			expect(app.workspace.openLinkText).not.toHaveBeenCalled();
			expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();
		} finally {
			view.contentEl.parentNode?.removeChild(view.contentEl);
		}
	});

	it("focuses something real in a cell that has no input at all", async () => {
		const app = new App();
		seedVault(app);
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = app;
		const view: AnvilView = new AnvilView(leaf, { settings: { getCardTitleOpensNote: () => false }, drill: (f) => { view.inspect(f); } });
		await view.onOpen();
		view.setLayout("codex");
		document.body.appendChild(view.contentEl);
		try {
			click(view.contentEl.querySelector(`[data-sf-link="${mara.path}"]`));
			const fieldsEl = view.contentEl.querySelector<HTMLElement>(".sf-ed-grid");

			// A File at its cap renders chips and NO add affordance, so this cell
			// contains no input, select or textarea. The promise is that the whole
			// cell is one target — a cell whose only outcome is focusing nothing
			// makes it dead pixels instead.
			const handle = renderFieldControl(
				fieldsEl!,
				fieldDef({ name: "book", type: "File" }),
				"[[Wardens of Moonharbor]]",
				{},
			);
			expect(handle.el.querySelector("input, select, textarea")).toBeNull();

			// The chip body, not its name: a link chip's NAME is a link and navigates.
			click(handle.el.querySelector(".sf-ed-chip"));

			// Focus lands on the CELL — which only works because the cell is
			// focusable. Not on the chip's × : that would put a destructive action
			// under Enter for anyone who merely clicked the cell.
			expect(view.contentEl.ownerDocument.activeElement).toBe(handle.el);
		} finally {
			view.contentEl.parentNode?.removeChild(view.contentEl);
		}
	});
});

// ---------------------------------------------------------------------------
// T5.5 — the Media control (S102): preview + path + Choose image… / Clear
// ---------------------------------------------------------------------------

interface MediaHarness extends Rendered {
	readonly pick: ReturnType<typeof vi.fn>;
}

function renderMedia(
	field: FieldDef,
	value: unknown,
	seams: { resolve?: (target: string) => string; picked?: string | null; label?: string } = {},
): MediaHarness {
	const host = document.createElement("div");
	document.body.appendChild(host);
	mounted.push(host);
	const edits: FieldValue[] = [];
	const pick = vi.fn(async () => seams.picked ?? null);
	const handle = renderFieldControl(host, field, value, {
		onEdit: (change) => { edits.push(change.value); },
		resolveImage: seams.resolve ?? ((target) => `app://vault/${target}`),
		pickImage: pick,
		...(seams.label !== undefined ? { label: seams.label } : {}),
	});
	return { el: handle.el, value: () => handle.value(), edits, pick };
}

const mediaField = (name: string): FieldDef => fieldDef({ name, type: "Media", width: "full" });
const MEDIA_PATH = "[data-sf-ed-media-path]";
const buttonNamed = (el: HTMLElement, text: string): HTMLButtonElement => {
	const found = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === text);
	if (!found) throw new Error(`no ${text} button`);
	return found;
};
const flushPicker = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 0)); };

describe("the Media control is chosen by TYPE, never by name (T5.5, ADR-32)", () => {
	it("gives a Media field named portrait the preview, path and buttons", () => {
		const { el } = renderMedia(mediaField("portrait"), "[[mara.png]]");
		expect(el.querySelector("img.sf-portrait-img")?.getAttribute("src")).toBe("app://vault/mara.png");
		expect(el.querySelector(MEDIA_PATH)?.textContent).toBe("[[mara.png]]");
		expect(buttonNamed(el, "Choose image…")).toBeTruthy();
		expect(buttonNamed(el, "Clear")).toBeTruthy();
	});

	it("gives a Media field with an arbitrary name the same control", () => {
		const { el } = renderMedia(mediaField("emblem"), "[[crest.png]]");
		expect(el.querySelector("img")?.getAttribute("src")).toBe("app://vault/crest.png");
		expect(el.querySelector(MEDIA_PATH)).not.toBeNull();
	});

	it("leaves an Input field named portrait as a plain text input", () => {
		const { el } = render(fieldDef({ name: "portrait", type: "Input" }), "mara.png");
		expect(inputIn(el).value).toBe("mara.png");
		expect(el.querySelector(MEDIA_PATH)).toBeNull();
		expect(el.querySelector("button")).toBeNull();
	});

	it("leaves MultiMedia on the text fallback", () => {
		const { el } = render(fieldDef({ name: "gallery", type: "MultiMedia" }), "a.png");
		expect(el.querySelector(MEDIA_PATH)).toBeNull();
	});
});

describe("the Media preview never shows a broken image (T5.5)", () => {
	it.each([[null], [""], [undefined]])("shows the monogram for an empty value %j", (value) => {
		const { el } = renderMedia(mediaField("portrait"), value);
		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("shows the monogram when the target cannot be resolved", () => {
		const { el } = renderMedia(mediaField("portrait"), "[[ghost.png]]", { resolve: () => "" });
		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
		// The stored text stays visible: the user can see what the file holds.
		expect(el.querySelector(MEDIA_PATH)?.textContent).toBe("[[ghost.png]]");
	});

	it("falls back to the monogram when the image fails to load", () => {
		const { el } = renderMedia(mediaField("portrait"), "[[corrupt.png]]");
		el.querySelector("img")?.dispatchEvent(new Event("error"));
		expect(el.querySelector("img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("takes the monogram from the note's name, not the field's, when empty", () => {
		const { el } = renderMedia(mediaField("portrait"), null, { label: "Mara Voss" });
		expect(el.querySelector(".sf-portrait-mono")?.textContent).toBe("MV");
		expect(el.querySelector(".sf-portrait")?.getAttribute("aria-label")).toBe("Mara Voss");
	});

	it("takes the monogram from the note's name after an image load error", () => {
		const { el } = renderMedia(mediaField("portrait"), "[[corrupt.png]]", { label: "Mara Voss" });
		expect(el.querySelector("img")?.getAttribute("alt")).toBe("Mara Voss");
		el.querySelector("img")?.dispatchEvent(new Event("error"));
		expect(el.querySelector(".sf-portrait-mono")?.textContent).toBe("MV");
		expect(el.querySelector(".sf-portrait")?.getAttribute("aria-label")).toBe("Mara Voss");
	});

	it("falls back to the field name when the host supplies no label", () => {
		const { el } = renderMedia(mediaField("portrait"), null);
		expect(el.querySelector(".sf-portrait-mono")?.textContent).toBe("P");
	});

	it("resolves the link target, not the bracketed text, for embeds and aliases", () => {
		const resolve = vi.fn((t: string) => `app://vault/${t}`);
		renderMedia(mediaField("portrait"), "![[art/mara.png|Mara]]", { resolve });
		expect(resolve).toHaveBeenCalledWith("art/mara.png");
	});
});

describe("the Media control reports through the normal path (T5.5)", () => {
	it("reports null and clears preview and path when Clear is pressed", () => {
		const m = renderMedia(mediaField("portrait"), "[[mara.png]]");
		buttonNamed(m.el, "Clear").click();
		expect(m.edits).toEqual([null]);
		expect(m.value()).toBeNull();
		expect(m.el.querySelector("img")).toBeNull();
		expect(m.el.querySelector(".sf-portrait-mono")).not.toBeNull();
		expect(m.el.querySelector(MEDIA_PATH)?.textContent).toBe("");
	});

	it("reports the wikilink the picker returns and updates preview and path", async () => {
		const m = renderMedia(mediaField("portrait"), null, { picked: "[[new.png]]" });
		buttonNamed(m.el, "Choose image…").click();
		await flushPicker();
		expect(m.edits).toEqual(["[[new.png]]"]);
		expect(m.value()).toBe("[[new.png]]");
		expect(m.el.querySelector("img")?.getAttribute("src")).toBe("app://vault/new.png");
		expect(m.el.querySelector(MEDIA_PATH)?.textContent).toBe("[[new.png]]");
	});

	it("reports nothing when the picker is dismissed", async () => {
		const m = renderMedia(mediaField("portrait"), "[[mara.png]]", { picked: null });
		buttonNamed(m.el, "Choose image…").click();
		await flushPicker();
		expect(m.edits).toEqual([]);
		expect(m.value()).toBe("[[mara.png]]");
	});

	it("offers no picker button when the host supplied no picker", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		mounted.push(host);
		const handle = renderFieldControl(host, mediaField("portrait"), "[[a.png]]");
		expect(handle.el.querySelector("button")?.textContent).toBe("Clear");
	});
});

describe("the Media control survives late events (T5.5 review)", () => {
	it("ignores an error from an image a Clear already replaced", () => {
		const m = renderMedia(mediaField("portrait"), "[[corrupt.png]]");
		const stale = m.el.querySelector("img");
		buttonNamed(m.el, "Clear").click();
		expect(() => stale?.dispatchEvent(new Event("error"))).not.toThrow();
		expect(m.el.querySelectorAll(".sf-portrait")).toHaveLength(1);
	});

	it("ignores an error from an image a Choose already replaced", async () => {
		const m = renderMedia(mediaField("portrait"), "[[old.png]]", { picked: "[[new.png]]" });
		const stale = m.el.querySelector("img");
		buttonNamed(m.el, "Choose image…").click();
		await flushPicker();
		expect(() => stale?.dispatchEvent(new Event("error"))).not.toThrow();
		expect(m.el.querySelectorAll(".sf-portrait")).toHaveLength(1);
		expect(m.el.querySelector("img")?.getAttribute("src")).toBe("app://vault/new.png");
	});

	it("drops a pick that resolves after the control was removed", async () => {
		let resolvePick: (link: string | null) => void = () => undefined;
		const host = document.createElement("div");
		document.body.appendChild(host);
		mounted.push(host);
		const edits: FieldValue[] = [];
		const handle = renderFieldControl(host, mediaField("portrait"), "[[a.png]]", {
			onEdit: (change) => { edits.push(change.value); },
			pickImage: () => new Promise((r) => { resolvePick = r; }),
		});
		buttonNamed(handle.el, "Choose image…").click();
		host.remove();
		resolvePick("[[late.png]]");
		await flushPicker();
		expect(edits).toEqual([]);
	});

	it("still commits a pick while the control is connected", async () => {
		const m = renderMedia(mediaField("portrait"), "[[a.png]]", { picked: "[[b.png]]" });
		buttonNamed(m.el, "Choose image…").click();
		await flushPicker();
		expect(m.edits).toEqual(["[[b.png]]"]);
	});
});

describe("the Media control does not write a no-op (T5.5 review)", () => {
	it("reports nothing when the picked link is the one already stored", async () => {
		const m = renderMedia(mediaField("portrait"), "[[mara.png]]", { picked: "[[mara.png]]" });
		buttonNamed(m.el, "Choose image…").click();
		await flushPicker();
		expect(m.edits).toEqual([]);
	});

	it.each([[null], [""]])("reports nothing when Clear is pressed on an empty field %j", (value) => {
		const m = renderMedia(mediaField("portrait"), value);
		buttonNamed(m.el, "Clear").click();
		expect(m.edits).toEqual([]);
	});
});
