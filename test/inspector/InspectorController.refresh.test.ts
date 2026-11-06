/**
 * InspectorController refresh rules — spec 009 T4.2 (ADR-42, closes #30).
 *
 * The Workbench takes outside changes (an undo, a hand edit, an Anvil write)
 * into every field that holds no unsaved text, and leaves the others alone:
 *  - `clean` and `saved` adopt the file's value; a `saved` field that changed
 *    returns to `clean` and drops its out-of-vocabulary advisory;
 *  - `dirty` and `error` keep their text, but compare against the file's value;
 *  - `saving` keeps its text and the value it started from;
 *  - a redraw blocked by a protected field is owed and runs through
 *    `onGuardCleared` once the last protected field clears.
 *
 * @ref SDD/ADR-42; ADR-37 (undoKeyPolicy); ADR-39 (isBusy probe)
 * @ref SDD/AC-F9.4, AC-F9.5, AC-F9.6; mockups.html U10
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App, Component, createMockCachedMetadata, createMockTFile } from "../__mocks__/obsidian";
import type { TFile } from "../__mocks__/obsidian";
import { InspectorController } from "inspector/InspectorController";
import * as frontmatterWriter from "inspector/frontmatterWriter";
import type { CommitResult, FieldSpec } from "inspector/frontmatterWriter";
import type { NoteContext } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Obsidian's cross-window Node.instanceOf, which the mock does not install
// (the same stand-in as test/undo/undoKeys.test.ts).
// ---------------------------------------------------------------------------

beforeAll(() => {
	const proto = Node.prototype as unknown as Record<string, unknown>;
	proto["instanceOf"] = function (this: Node, type: { name: string }): boolean {
		const win = (this.ownerDocument?.defaultView ?? window) as unknown as Record<string, new () => unknown>;
		const ctor = win[type.name];
		return ctor !== undefined && this instanceof ctor;
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";
const STATUS: FieldSpec = { name: "status", type: "select", values: ["alive", "missing", "dead"] };
const AGE: FieldSpec = { name: "age", type: "number" };
const ALIASES: FieldSpec = { name: "aliases", type: "text" };
const NICKNAME: FieldSpec = { name: "nickname", type: "text" };
const ROLE: FieldSpec = { name: "role", type: "select", values: ["protagonist", "antagonist"] };
const ALIVE: FieldSpec = { name: "alive", type: "boolean" };

const WRITE_ERROR: CommitResult = { ok: false, reason: "write", message: "Couldn't write.", keepDirty: true };

function makeCtx(file: TFile, frontmatter: Record<string, unknown>): NoteContext {
	return { activeFile: file, activeKind: "character", entities: [], backlinks: [], frontmatter, resolvedAt: Date.now() };
}

interface Workbench {
	app: App;
	file: TFile;
	controller: InspectorController;
	container: HTMLElement;
	fields: FieldSpec[];
}

function openWorkbench(frontmatter: Record<string, unknown>, fields: FieldSpec[]): Workbench {
	const app = new App();
	const file = createMockTFile({ path: PATH, basename: "Mara Stoneway" });
	const controller = new InspectorController(app, new Component());
	const container = document.createElement("div");
	document.body.appendChild(container);
	controller.render(container, makeCtx(file, frontmatter), fields);
	return { app, file, controller, container, fields };
}

/**
 * The file changes outside the Workbench. Mirrors SidebarView's `changed`
 * handler: the controller is told first, and only when it does not guard does
 * the view redraw with the re-resolved context.
 * @returns whether the controller guarded (blocked the redraw)
 */
function changeFile(wb: Workbench, frontmatter: Record<string, unknown>): boolean {
	vi.mocked(wb.app.metadataCache.getFileCache).mockReturnValue(createMockCachedMetadata({ frontmatter }));
	const guarded = wb.controller.notifyFileChanged(wb.file);
	if (!guarded) {
		wb.container.replaceChildren();
		wb.controller.render(wb.container, makeCtx(wb.file, frontmatter), wb.fields);
	}
	return guarded;
}

function inputOf(wb: Workbench, name: string): HTMLInputElement {
	return wb.container.querySelector(`[data-sf-inspector-input="${name}"]`) as HTMLInputElement;
}

function selectOf(wb: Workbench, name: string): HTMLSelectElement {
	return wb.container.querySelector(`[data-sf-inspector-input="${name}"]`) as HTMLSelectElement;
}

function type(wb: Workbench, name: string, value: string): void {
	const input = inputOf(wb, name);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function choose(wb: Workbench, name: string, value: string): void {
	const sel = selectOf(wb, name);
	if (!Array.from(sel.options).some((o) => o.value === value)) {
		const opt = document.createElement("option");
		opt.value = value;
		sel.appendChild(opt);
	}
	sel.value = value;
	sel.dispatchEvent(new Event("change", { bubbles: true }));
}

function hasSave(wb: Workbench, name: string): boolean {
	return wb.container.querySelector(`[data-sf-inspector-commit="${name}"]`) !== null;
}

function clickSave(wb: Workbench, name: string): void {
	(wb.container.querySelector(`[data-sf-inspector-commit="${name}"]`) as HTMLButtonElement).click();
}

/** Each field's commit answers with its own result; a field missing from the map never settles. */
function stubCommit(results: Record<string, CommitResult>): void {
	vi.spyOn(frontmatterWriter, "commit").mockImplementation((_app, _file, key) =>
		key in results ? Promise.resolve(results[key]!) : new Promise<CommitResult>(() => undefined),
	);
}

/** A commit whose result the test decides later. */
function stubPendingCommit(): (result: CommitResult) => void {
	let settle!: (result: CommitResult) => void;
	vi.spyOn(frontmatterWriter, "commit").mockReturnValue(new Promise<CommitResult>((r) => { settle = r; }));
	return settle;
}

const settled = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// clean and saved take the file's value (AC-F9.4, U10a/b)
// ---------------------------------------------------------------------------

describe("InspectorController refresh: clean and saved fields", () => {
	it("show the file's value, and a saved field no longer claims a value it doesn't hold", async () => {
		stubCommit({ status: { ok: true } });
		const wb = openWorkbench({ status: "alive", age: 19 }, [STATUS, AGE]);
		choose(wb, "status", "missing");
		clickSave(wb, "status");
		await settled();

		changeFile(wb, { status: "dead", age: 20 });

		expect(selectOf(wb, "status").value).toBe("dead");
		expect(inputOf(wb, "age").value).toBe("20");
		// "missing" is no longer what the file holds: choosing it again is an edit.
		choose(wb, "status", "missing");
		expect(hasSave(wb, "status")).toBe(true);
	});

	it("a saved field keeps its value when the change is its own write coming back", async () => {
		stubCommit({ role: { ok: true } });
		const wb = openWorkbench({ role: "protagonist" }, [ROLE]);
		choose(wb, "role", "villain");
		clickSave(wb, "role");
		await settled();

		changeFile(wb, { role: "villain" });

		expect(selectOf(wb, "role").value).toBe("villain");
		expect(wb.container.querySelector('[data-sf-inspector-advisory="role"]')).not.toBeNull();
	});

	it("a redraw with a newer context refreshes a saved field too, without a change notice first", async () => {
		stubCommit({ status: { ok: true } });
		const wb = openWorkbench({ status: "alive" }, [STATUS]);
		choose(wb, "status", "missing");
		clickSave(wb, "status");
		await settled();

		wb.container.replaceChildren();
		wb.controller.render(wb.container, makeCtx(wb.file, { status: "dead" }), [STATUS]);

		expect(selectOf(wb, "status").value).toBe("dead");
	});
});

// ---------------------------------------------------------------------------
// dirty, saving and error keep their text (AC-F9.5, U10c)
// ---------------------------------------------------------------------------

describe("InspectorController refresh: protected fields", () => {
	it("dirty, saving and error fields keep their text while the others update in place", async () => {
		stubCommit({ nickname: WRITE_ERROR }); // `aliases` never settles: it stays saving
		const wb = openWorkbench({ aliases: "Mara", nickname: "Spark", status: "alive", age: 19 }, [ALIASES, NICKNAME, STATUS, AGE]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		await settled();
		type(wb, "aliases", "Mara, Stone");
		clickSave(wb, "aliases");
		choose(wb, "status", "missing");
		const ageInput = inputOf(wb, "age");

		const guarded = changeFile(wb, { aliases: "M.", nickname: "Ash", status: "dead", age: 20 });

		expect(guarded).toBe(true);
		expect(inputOf(wb, "aliases").value).toBe("Mara, Stone");
		expect(inputOf(wb, "nickname").value).toBe("Ember");
		expect(wb.container.querySelector('[data-sf-inspector-error="nickname"]')?.textContent).toContain("Couldn't write.");
		expect(selectOf(wb, "status").value).toBe("missing");
		expect(hasSave(wb, "status")).toBe(true);
		expect(inputOf(wb, "age").value).toBe("20");
		expect(ageInput.isConnected).toBe(false); // the age row was redrawn in place …
		expect(wb.container.querySelectorAll('[data-sf-inspector-input="age"]')).toHaveLength(1); // … not added twice
	});

	it("a dirty field compares against the file's current value, so restoring the text discards the draft (AC-F9.6)", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");

		changeFile(wb, { nickname: "Ash" });

		expect(inputOf(wb, "nickname").value).toBe("Ember");
		type(wb, "nickname", "Ash");
		expect(hasSave(wb, "nickname")).toBe(false);
		// The old value is no longer what the file holds: typing it is an edit.
		type(wb, "nickname", "Spark");
		expect(hasSave(wb, "nickname")).toBe(true);
	});

	it("a later redraw with the context from before the change keeps a dirty field's comparison current", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		changeFile(wb, { nickname: "Ash" });

		// SidebarView redraws its body (a tab switch) from the context it resolved before the change.
		wb.container.replaceChildren();
		wb.controller.render(wb.container, makeCtx(wb.file, { nickname: "Spark" }), [NICKNAME]);

		expect(inputOf(wb, "nickname").value).toBe("Ember");
		type(wb, "nickname", "Ash");
		expect(hasSave(wb, "nickname")).toBe(false);
	});

	it("an error field compares against the file's current value too", async () => {
		stubCommit({ nickname: WRITE_ERROR });
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		await settled();

		changeFile(wb, { nickname: "Ash" });

		expect(inputOf(wb, "nickname").value).toBe("Ember");
		type(wb, "nickname", "Ash");
		expect(hasSave(wb, "nickname")).toBe(false);
	});

	it("a saving field keeps the value it started from; the write's result settles it", async () => {
		const settle = stubPendingCommit();
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");

		changeFile(wb, { nickname: "Ash" });
		settle(WRITE_ERROR);
		await settled();

		expect(inputOf(wb, "nickname").value).toBe("Ember");
		// Its stored value is still "Spark", not the outside "Ash".
		type(wb, "nickname", "Spark");
		expect(hasSave(wb, "nickname")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// out-of-vocabulary advisory (U10b)
// ---------------------------------------------------------------------------

describe("InspectorController refresh: out-of-vocabulary advisory", () => {
	it("a saved field that takes an outside value drops its advisory", async () => {
		stubCommit({ role: { ok: true } });
		const wb = openWorkbench({ role: "protagonist" }, [ROLE]);
		choose(wb, "role", "villain");
		clickSave(wb, "role");
		await settled();
		expect(wb.container.querySelector('[data-sf-inspector-advisory="role"]')).not.toBeNull();

		changeFile(wb, { role: "antagonist" });

		expect(selectOf(wb, "role").value).toBe("antagonist");
		expect(wb.container.querySelector('[data-sf-inspector-advisory="role"]')).toBeNull();
	});

	it("drops it in place too, while another field holds a draft", async () => {
		stubCommit({ role: { ok: true } });
		const wb = openWorkbench({ role: "protagonist", nickname: "Spark" }, [ROLE, NICKNAME]);
		choose(wb, "role", "villain");
		clickSave(wb, "role");
		await settled();
		type(wb, "nickname", "Ember");

		changeFile(wb, { role: "antagonist", nickname: "Spark" });

		expect(selectOf(wb, "role").value).toBe("antagonist");
		expect(wb.container.querySelector('[data-sf-inspector-advisory="role"]')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// the owed redraw
// ---------------------------------------------------------------------------

describe("InspectorController refresh: owed redraw", () => {
	it("a redraw blocked by a protected field is owed, and runs through onGuardCleared when the field clears", async () => {
		stubCommit({ nickname: { ok: true } });
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		const onGuardCleared = vi.fn();
		wb.controller.onGuardCleared = onGuardCleared;
		type(wb, "nickname", "Ember");

		expect(changeFile(wb, { nickname: "Spark", age: 19 })).toBe(true);
		expect(onGuardCleared).not.toHaveBeenCalled();

		clickSave(wb, "nickname");
		await settled();
		expect(onGuardCleared).toHaveBeenCalledTimes(1);
	});

	it("waits for the last protected field", () => {
		const wb = openWorkbench({ nickname: "Spark", aliases: "Mara" }, [NICKNAME, ALIASES]);
		const onGuardCleared = vi.fn();
		wb.controller.onGuardCleared = onGuardCleared;
		type(wb, "nickname", "Ember");
		type(wb, "aliases", "Mara, Stone");
		changeFile(wb, { nickname: "Spark", aliases: "Mara", age: 19 });

		type(wb, "nickname", "Spark");
		expect(onGuardCleared).not.toHaveBeenCalled();
		type(wb, "aliases", "Mara");
		expect(onGuardCleared).toHaveBeenCalledTimes(1);
	});

	it("is not run when nothing was owed, and runs only once per blocked redraw", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		const onGuardCleared = vi.fn();
		wb.controller.onGuardCleared = onGuardCleared;

		type(wb, "nickname", "Ember");
		type(wb, "nickname", "Spark");
		expect(onGuardCleared).not.toHaveBeenCalled();

		type(wb, "nickname", "Ember");
		changeFile(wb, { nickname: "Spark" });
		type(wb, "nickname", "Spark");
		type(wb, "nickname", "Ember");
		type(wb, "nickname", "Spark");
		expect(onGuardCleared).toHaveBeenCalledTimes(1);
	});

	it("a new subject settles what was owed", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		const onGuardCleared = vi.fn();
		wb.controller.onGuardCleared = onGuardCleared;
		type(wb, "nickname", "Ember");
		changeFile(wb, { nickname: "Spark", age: 19 });

		wb.controller.teardown();
		wb.container.replaceChildren();
		wb.controller.render(wb.container, makeCtx(wb.file, { nickname: "Spark" }), [NICKNAME]);
		type(wb, "nickname", "Ember");
		type(wb, "nickname", "Spark");

		expect(onGuardCleared).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// isBusy — the Workbench's pending probe (ADR-39)
// ---------------------------------------------------------------------------

describe("InspectorController.isBusy", () => {
	it("is null while every field is clean", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		expect(wb.controller.isBusy(PATH)).toBeNull();
	});

	it("gives draft for a dirty field, only for the subject", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		expect(wb.controller.isBusy(PATH)).toBe("draft");
		expect(wb.controller.isBusy("30 Canon/31 Characters/Other.md")).toBeNull();
	});

	it("gives write while a field is saving, and draft after its write failed", async () => {
		const settle = stubPendingCommit();
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		expect(wb.controller.isBusy(PATH)).toBe("write");
		expect(wb.controller.isBusy("Other.md")).toBeNull();

		settle(WRITE_ERROR);
		await settled();
		expect(wb.controller.isBusy(PATH)).toBe("draft");
	});

	it("gives draft when one field is dirty while another is saving: the edit needs the user", () => {
		stubPendingCommit();
		const wb = openWorkbench({ nickname: "Spark", aliases: "Mara" }, [NICKNAME, ALIASES]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		type(wb, "aliases", "Mara, Stone");
		expect(wb.controller.isBusy(PATH)).toBe("draft");
	});

	it("is null once the write has landed", async () => {
		stubCommit({ nickname: { ok: true } });
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		await settled();
		expect(wb.controller.isBusy(PATH)).toBeNull();
	});

	it("is null with no subject", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		wb.controller.teardown();
		expect(wb.controller.isBusy(PATH)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// undoKeyPolicy — Mod+Z in the Workbench (ADR-37)
// ---------------------------------------------------------------------------

describe("InspectorController.undoKeyPolicy", () => {
	it("gives text for a text field with a draft", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		expect(wb.controller.undoKeyPolicy(inputOf(wb, "nickname"))).toBe("text");
	});

	it("gives text for a text field whose write failed or is in flight", async () => {
		const settle = stubPendingCommit();
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		expect(wb.controller.undoKeyPolicy(inputOf(wb, "nickname"))).toBe("text");

		settle(WRITE_ERROR);
		await settled();
		expect(wb.controller.undoKeyPolicy(inputOf(wb, "nickname"))).toBe("text");
	});

	it("gives journal for a clean or saved text field, caret still in it", async () => {
		stubCommit({ nickname: { ok: true } });
		const wb = openWorkbench({ nickname: "Spark", age: 19 }, [NICKNAME, AGE]);
		expect(wb.controller.undoKeyPolicy(inputOf(wb, "age"))).toBe("journal");

		type(wb, "nickname", "Ember");
		clickSave(wb, "nickname");
		await settled();
		expect(wb.controller.undoKeyPolicy(inputOf(wb, "nickname"))).toBe("journal");
	});

	it("gives journal for a control that takes no typed text, even with a draft", () => {
		const wb = openWorkbench({ status: "alive", alive: false }, [STATUS, ALIVE]);
		choose(wb, "status", "dead");
		const box = inputOf(wb, "alive");
		box.checked = true;
		box.dispatchEvent(new Event("input", { bubbles: true }));

		expect(wb.controller.undoKeyPolicy(selectOf(wb, "status"))).toBe("journal");
		expect(wb.controller.undoKeyPolicy(box)).toBe("journal");
		expect(wb.controller.undoKeyPolicy(wb.container)).toBe("journal");
		expect(wb.controller.undoKeyPolicy(null)).toBe("journal");
	});

	it("gives text for a text input that is not a Workbench field", () => {
		const wb = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		const foreign = document.createElement("input");
		foreign.type = "text";
		wb.container.appendChild(foreign);
		expect(wb.controller.undoKeyPolicy(foreign)).toBe("text");
	});

	it("treats another Workbench's field of the same name as foreign", () => {
		const mine = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		const other = openWorkbench({ nickname: "Spark" }, [NICKNAME]);
		type(other, "nickname", "Ember");
		expect(mine.controller.undoKeyPolicy(inputOf(other, "nickname"))).toBe("text");
	});
});
