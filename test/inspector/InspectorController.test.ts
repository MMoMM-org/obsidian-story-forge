/**
 * InspectorController tests — T5.2 (RED first, per TDD).
 *
 * Tests:
 *  - render: editable scalar/enum controls shown; read-only fields (list/relation/tags/fixed)
 *    shown read-only without edit control.
 *  - dirty state machine: editing past committed value → dirty + commit affordance;
 *    reverting to committed value → clean (affordance hidden); clearing (null) → dirty.
 *  - commit → saved: valid edit calls frontmatterWriter.commit → {ok:true} → saved state.
 *  - commit → error (validation): error shown + edit retained.
 *  - commit → error (write): error shown + edit retained + Retry re-attempts.
 *  - listeners: registered once on owned container, not per-field-per-render.
 *  - teardown: close/re-subject clears transient dirty state.
 *  - dirty-guard: controller's own commit fires metadataCache.changed → does NOT
 *    clobber an in-flight edit.
 *  - out-of-vocab advisory: visible inline cue shown after a successful {ok:true}
 *    commit of an out-of-vocab select value.
 *
 * @ref SDD/ADR-3 — Inspector home = edit-mode overlay inside SidebarView
 * @ref SDD/ADR-7 — block type errors, warn vocab; out-of-vocab advisory visible
 * @ref PRD/AC-F6.1 — read-only detail + editable scalar/enum
 * @ref PRD/AC-F6.2 — dirty state
 * @ref PRD/AC-F6.4 — committed edit fans out to M3 panel (via metadataCache)
 * @ref CON-1 — transient in-memory dirty state only, never persisted
 * @ref CON-4 — teardown discipline, listener cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, TFile, Component } from "../__mocks__/obsidian";
import { InspectorController } from "inspector/InspectorController";
import * as frontmatterWriter from "inspector/frontmatterWriter";
import type { FieldSpec, CommitResult } from "inspector/frontmatterWriter";
import { inspectorFieldsFromModel } from "inspector/inspectorFieldsFromModel";
import { buildFieldModel } from "editor/fieldModel";
import type { FieldType as DeclaredType } from "fileclass/fileClassTypes";
import type { NoteContext, EntityKind } from "scoping/NoteContext";

// Each test spies on frontmatterWriter.commit; vitest 4 reuses an existing spy, so restore
// it after every test or its call count carries into the next one.
afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeFile(path = "30 Canon/31 Characters/Alice.md"): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = "Alice";
	f.name = "Alice.md";
	f.extension = "md";
	return f;
}

function makeCtx(
	file: TFile,
	kind: EntityKind = "character",
	frontmatter: Record<string, unknown> = {},
): NoteContext {
	return {
		activeFile: file,
		activeKind: kind,
		entities: [],
		backlinks: [],
		frontmatter,
		resolvedAt: Date.now(),
	};
}

function makeTextField(name: string): FieldSpec {
	return { name, type: "text" };
}

function makeNumberField(name: string): FieldSpec {
	return { name, type: "number" };
}

function makeSelectField(name: string, values: string[] = []): FieldSpec {
	return { name, type: "select", values };
}

function makeListField(name: string): FieldSpec {
	return { name, type: "list" };
}

function makeRelationField(name: string): FieldSpec {
	return { name, type: "relation" };
}

function makeTagsField(name: string): FieldSpec {
	return { name, type: "tags" };
}

function makeFixedField(name: string): FieldSpec {
	return { name, type: "fixed" };
}

function makeContainer(): HTMLElement {
	const el = document.createElement("div");
	// The global HTMLElement augmentation (obsidian-augment.d.ts) adds createEl/
	// createDiv/createSpan/empty to the HTMLElement interface. The jsdom runtime
	// does NOT implement them — we wire them manually here so the controller's
	// DOM calls work in the test environment without a live Obsidian runtime.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(el as any).createDiv = (opts?: { cls?: string; text?: string }): HTMLDivElement => {
		const child = document.createElement("div");
		if (opts?.cls) child.className = opts.cls;
		if (opts?.text) child.textContent = opts.text;
		el.appendChild(child);
		return child;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(el as any).createSpan = (opts?: { cls?: string; text?: string }): HTMLSpanElement => {
		const child = document.createElement("span");
		if (opts?.cls) child.className = opts.cls;
		if (opts?.text) child.textContent = opts.text;
		el.appendChild(child);
		return child;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(el as any).empty = (): void => {
		el.innerHTML = "";
	};
	return el;
}

/** Create a parent Component that owns the InspectorController (mirrors SidebarView pattern). */
function makeOwner(): Component {
	return new Component();
}

// ---------------------------------------------------------------------------
// Helper to build InspectorController and render it
// ---------------------------------------------------------------------------

function buildController(
	app: App,
	file: TFile,
	ctx: NoteContext,
	fields: FieldSpec[],
	owner?: Component,
): { controller: InspectorController; container: HTMLElement } {
	const container = makeContainer();
	const parentOwner = owner ?? makeOwner();
	const controller = new InspectorController(app, parentOwner);
	controller.render(container, ctx, fields);
	return { controller, container };
}

// ---------------------------------------------------------------------------
// render: a list stored in a field declared as a scalar (T6.3)
// ---------------------------------------------------------------------------

describe("InspectorController: a list stored in a field declared as a scalar", () => {
	/** The Workbench row for a field declared `type` on a note holding `value`. */
	function renderDeclared(app: App, type: DeclaredType, value: unknown): HTMLElement {
		const file = makeFile();
		const model = buildFieldModel(
			[{ name: "fc-note", fields: [{ id: "f", name: "subject", type }] }],
			{ subject: value },
		);
		const ctx = makeCtx(file, "character", { subject: value });
		const { container } = buildController(app, file, ctx, inspectorFieldsFromModel(model));
		return container;
	}

	it("shows read-only text chips, with no control to edit them through", () => {
		const container = renderDeclared(makeApp(), "Input", ["one", "two"]);

		const chips = Array.from(container.querySelectorAll(".sf-inspector-chip")).map((chip) => chip.textContent);
		expect(chips).toEqual(["one", "two"]);
		expect(container.querySelector("[data-sf-inspector-input]")).toBeNull();
	});

	it("shows one link chip per [[link]], never one chip for the joined list", () => {
		const app = makeApp();
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) => {
			const target = makeFile(`30 Canon/${link}.md`);
			target.basename = link;
			return target;
		});
		const container = renderDeclared(app, "File", ["[[A]]", "[[B]]"]);

		const links = Array.from(container.querySelectorAll(".sf-inspector-chip-link")).map((chip) => chip.textContent);
		expect(links).toEqual(["A", "B"]);
		expect(container.querySelector(".sf-inspector-ro-chip")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// render: field controls
// ---------------------------------------------------------------------------

describe("InspectorController: render", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("renders an editable text input for a text field", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input[type='text'], input:not([type='checkbox'])");
		expect(input).not.toBeNull();
	});

	it("renders an editable input for a number field", () => {
		const ctx = makeCtx(file, "character", { age: 30 });
		const { container } = buildController(app, file, ctx, [makeNumberField("age")]);

		// Number fields use type="text" + inputMode="numeric" to allow intermediate
		// values and preserve edits on validation error (see AC-F6.5).
		const input = container.querySelector("[data-sf-inspector-input='age']");
		expect(input).not.toBeNull();
	});

	it("renders a select/dropdown for a select field with values", () => {
		const ctx = makeCtx(file, "character", { role: "protagonist" });
		const { container } = buildController(app, file, ctx, [
			makeSelectField("role", ["protagonist", "antagonist", "supporting"]),
		]);

		// Either a <select> or an element with role="listbox"/"combobox"
		const sel = container.querySelector("select") ?? container.querySelector("[role='combobox']") ?? container.querySelector("[role='listbox']");
		expect(sel).not.toBeNull();
	});

	it("does NOT render an edit control for a list field (read-only)", () => {
		const ctx = makeCtx(file, "character", { aliases: ["Spark", "Al"] });
		const { container } = buildController(app, file, ctx, [makeListField("aliases")]);

		// No inputs should be present for read-only fields
		const input = container.querySelector("input, select, textarea");
		expect(input).toBeNull();
	});

	it("does NOT render an edit control for a relation field (read-only)", () => {
		const ctx = makeCtx(file, "character", { friends: ["[[Bob]]"] });
		const { container } = buildController(app, file, ctx, [makeRelationField("friends")]);

		const input = container.querySelector("input, select, textarea");
		expect(input).toBeNull();
	});

	it("does NOT render an edit control for a tags field (read-only)", () => {
		const ctx = makeCtx(file, "character", { tags: ["canon/character"] });
		const { container } = buildController(app, file, ctx, [makeTagsField("tags")]);

		const input = container.querySelector("input, select, textarea");
		expect(input).toBeNull();
	});

	it("does NOT render an edit control for a fixed field (read-only)", () => {
		const ctx = makeCtx(file, "character", { type: "character" });
		const { container } = buildController(app, file, ctx, [makeFixedField("type")]);

		const input = container.querySelector("input, select, textarea");
		expect(input).toBeNull();
	});

	it("renders field label for each field", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		expect(container.textContent).toContain("nickname");
	});

	it("pre-fills input with committed frontmatter value", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement | null;
		expect(input?.value).toBe("Spark");
	});
});

// ---------------------------------------------------------------------------
// dirty state machine
// ---------------------------------------------------------------------------

describe("InspectorController: dirty state machine", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("starts clean — no commit affordance shown initially", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		// No "save" / "commit" button visible initially
		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).toBeNull();
	});

	it("editing an input past the committed value → dirty → commit affordance appears", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Commit button should now be visible
		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).not.toBeNull();
	});

	it("reverting input to committed value → clean → commit affordance hidden", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;

		// Dirty: change away
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Revert to committed
		input.value = "Spark";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).toBeNull();
	});

	it("clearing input to empty string → dirty (differs from non-null committed value)", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).not.toBeNull();
	});

	it("field with null/undefined frontmatter value → input empty, editing → dirty", () => {
		// No value for nickname in frontmatter → starts as null/empty
		const ctx = makeCtx(file, "character", {});
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		// Initially empty (committed = null/undefined)
		expect(input.value).toBe("");

		// Editing into a value → dirty
		input.value = "Spark";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// commit → saved (S54)
// ---------------------------------------------------------------------------

describe("InspectorController: commit → saved", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	it("clicking commit calls frontmatterWriter.commit with correct args", async () => {
		const commitSpy = vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();

		// Give microtasks a chance
		await Promise.resolve();

		expect(commitSpy).toHaveBeenCalledWith(
			app,
			file,
			"nickname",
			"Ember",
			expect.objectContaining({ name: "nickname", type: "text" }),
		);
		commitSpy.mockRestore();
	});

	it("successful commit → saved state shown (no error, no commit button)", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();

		await Promise.resolve();
		// Wait for async commit to resolve
		await new Promise<void>(r => setTimeout(r, 0));

		// After successful commit, no blocking error shown
		const errorEl = container.querySelector("[data-sf-inspector-error]");
		expect(errorEl).toBeNull();
	});

	it("successful commit → dirty cleared (commit affordance removed)", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();

		await new Promise<void>(r => setTimeout(r, 0));

		// Commit affordance removed on save
		const commitBtnAfter = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtnAfter).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// commit → error: validation (S55)
// ---------------------------------------------------------------------------

describe("InspectorController: commit → validation error", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("validation error → error element shown with message", async () => {
		const validationResult: CommitResult = {
			ok: false,
			reason: "validation",
			message: "Field 'age' expects a finite number, got string.",
			keepDirty: true,
		};
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue(validationResult);

		const ctx = makeCtx(file, "character", { age: 30 });
		const { container } = buildController(app, file, ctx, [makeNumberField("age")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "thirty";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		const errorEl = container.querySelector("[data-sf-inspector-error]");
		expect(errorEl).not.toBeNull();
		expect(errorEl?.textContent).toContain("finite number");
	});

	it("validation error → edit value RETAINED in input (keepDirty)", async () => {
		const validationResult: CommitResult = {
			ok: false,
			reason: "validation",
			message: "Type error",
			keepDirty: true,
		};
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue(validationResult);

		const ctx = makeCtx(file, "character", { age: 30 });
		const { container } = buildController(app, file, ctx, [makeNumberField("age")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "thirty";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// Edit value preserved in input
		expect(input.value).toBe("thirty");
	});

	it("validation error → commit affordance remains (user can fix and retry)", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({
			ok: false,
			reason: "validation",
			message: "Type error",
			keepDirty: true,
		});

		const ctx = makeCtx(file, "character", { age: 30 });
		const { container } = buildController(app, file, ctx, [makeNumberField("age")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "thirty";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// User can still see the commit button (to re-attempt after fixing)
		const commitBtnAfter = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtnAfter).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// commit → error: write failure (S55 + Retry)
// ---------------------------------------------------------------------------

describe("InspectorController: commit → write error", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("write error → error element shown", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({
			ok: false,
			reason: "write",
			message: "Couldn't write frontmatter.",
			keepDirty: true,
		});

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		const errorEl = container.querySelector("[data-sf-inspector-error]");
		expect(errorEl).not.toBeNull();
	});

	it("write error → edit RETAINED (keepDirty)", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({
			ok: false,
			reason: "write",
			message: "Couldn't write frontmatter.",
			keepDirty: true,
		});

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		expect(input.value).toBe("Ember");
	});

	it("write error → Retry button shown", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({
			ok: false,
			reason: "write",
			message: "Couldn't write frontmatter.",
			keepDirty: true,
		});

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		const retryBtn = container.querySelector("[data-sf-inspector-retry]");
		expect(retryBtn).not.toBeNull();
	});

	it("Retry re-attempts the commit call", async () => {
		const commitSpy = vi.spyOn(frontmatterWriter, "commit")
			.mockResolvedValueOnce({
				ok: false,
				reason: "write",
				message: "Couldn't write frontmatter.",
				keepDirty: true,
			})
			.mockResolvedValueOnce({ ok: true });

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// First commit → write error
		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// Retry
		const retryBtn = container.querySelector("[data-sf-inspector-retry]") as HTMLButtonElement;
		retryBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// commit should have been called twice
		expect(commitSpy).toHaveBeenCalledTimes(2);
		commitSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// listener discipline: registered once on owned container (no per-render leak)
// ---------------------------------------------------------------------------

describe("InspectorController: listener discipline", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("listeners are registered on the owned container component (registerDomEvent pattern)", () => {
		const owner = makeOwner();
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		// The controller should have called registerDomEvent on an owned component
		// (either the owner or its own child Component). We verify by checking
		// that the owner or its delegates have tracked cleanup.
		// Proxy: calling unload on the owner should not throw.
		expect(() => { owner._unload(); }).not.toThrow();
	});

	it("re-rendering (new subject) does not multiply listeners", () => {
		// Re-render with a new context — event listeners must not accumulate
		const owner = makeOwner();
		const ctx1 = makeCtx(file, "character", { nickname: "Spark" });
		const ctx2 = makeCtx(file, "character", { nickname: "Ember" });
		const container = makeContainer();
		const controller = new InspectorController(app, owner);

		controller.render(container, ctx1, [makeTextField("nickname")]);
		// Re-render same container
		(container as unknown as { empty: () => void }).empty();
		controller.render(container, ctx2, [makeTextField("nickname")]);

		// Should still work without error / doubled handlers
		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Fire";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// teardown: onClose/re-subject clears dirty state
// ---------------------------------------------------------------------------

describe("InspectorController: teardown", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("teardown clears in-memory dirty state (no error survives a new subject)", async () => {
		const owner = makeOwner();
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		// Make dirty
		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Teardown (simulates re-subject or onClose)
		controller.teardown();

		// Re-render fresh
		(container as unknown as { empty: () => void }).empty();
		controller.render(container, ctx, [makeTextField("nickname")]);

		// After teardown + re-render, commit affordance gone (clean state)
		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).toBeNull();
	});

	it("teardown does not persist dirty state — CON-1", () => {
		// Verify saveData/any plugin-data path is never called
		const owner = makeOwner();
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		controller.teardown();

		// No vault writes, no saveData — CON-1
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(app.vault.create).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// dirty-guard: own commit's metadataCache.changed must NOT clobber in-flight edit
// ---------------------------------------------------------------------------

describe("InspectorController: dirty-guard", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	it("metadataCache.changed fired for same file after commit does NOT wipe a new in-flight edit", async () => {
		// This simulates the generation-guard scenario:
		// 1. User makes edit A, commits → saved
		// 2. metadataCache.changed fires (from the write fan-out)
		// 3. User has already started edit B (new dirty value)
		// 4. The changed event must NOT re-resolve/re-render in a way that
		//    discards edit B from the input

		// The InspectorController is informed of a "changed" event via
		// notifyFileChanged(file). If the controller is in a dirty state for a
		// DIFFERENT field or a newly dirty field, that state must survive.

		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;

		// Edit A: user types Ember
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Commit A
		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// Immediately (before metadataCache.changed re-renders), user types Fire
		input.value = "Fire";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Simulate the metadataCache.changed event from the write fan-out
		controller.notifyFileChanged(file);

		// Edit B ("Fire") must still be in the input — not wiped by the changed event
		expect(input.value).toBe("Fire");
	});

	it("notifyFileChanged for a different file does not affect the current edit", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		// Different file changed — should be no-op
		const otherFile = makeFile("Other.md");
		controller.notifyFileChanged(otherFile);

		expect(input.value).toBe("Ember");
		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// out-of-vocab advisory: visible inline cue (ADR-7 carry-over)
// ---------------------------------------------------------------------------

describe("InspectorController: out-of-vocab advisory", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	it("commit of an out-of-vocab select value → {ok:true} + advisory cue visible", async () => {
		// out-of-vocab: frontmatterWriter returns {ok:true} (write proceeds)
		// InspectorController should show an inline advisory, not a blocking error.
		// The out-of-vocab value is pre-existing in frontmatter (it was written by
		// another tool), so the controller renders it as a pre-populated out-of-vocab
		// option. The user commits without changing it (already dirty detection is
		// not needed — we can simulate by pre-loading an out-of-vocab committed value).
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });

		const field = { name: "role", type: "select" as const, values: ["protagonist", "antagonist"] };
		// frontmatter has an out-of-vocab value already
		const ctx = makeCtx(file, "character", { role: "sidekick" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [field]);

		// The select should have "sidekick" as current value (pre-existing out-of-vocab)
		const sel = container.querySelector("select") as HTMLSelectElement;
		expect(sel.value).toBe("sidekick");

		// User selects a different out-of-vocab value by adding it manually (simulating
		// what a real Obsidian select with custom options would do) and fires change
		const newOpt = document.createElement("option");
		newOpt.value = "villain";
		sel.appendChild(newOpt);
		sel.value = "villain";
		sel.dispatchEvent(new Event("change", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// An advisory (non-blocking) cue should appear — NOT a blocking error
		const advisoryEl = container.querySelector("[data-sf-inspector-advisory]");
		expect(advisoryEl).not.toBeNull();
	});

	it("out-of-vocab advisory is distinct from blocking validation error — no blocking error shown", async () => {
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });

		const field = { name: "role", type: "select" as const, values: ["protagonist", "antagonist"] };
		// Start with an out-of-vocab value
		const ctx = makeCtx(file, "character", { role: "sidekick" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [field]);

		const sel = container.querySelector("select") as HTMLSelectElement;
		const newOpt = document.createElement("option");
		newOpt.value = "villain";
		sel.appendChild(newOpt);
		sel.value = "villain";
		sel.dispatchEvent(new Event("change", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// No BLOCKING error — advisory is informational
		const blockingError = container.querySelector("[data-sf-inspector-error]");
		expect(blockingError).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// dirty-guard integration: notifyFileChanged returns boolean; SidebarView
// skips _resolveAndRender when the guard fires
// ---------------------------------------------------------------------------

describe("InspectorController: dirty-guard — notifyFileChanged return value", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	it("returns false when all fields are clean (caller should re-render)", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { controller } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const guarded = controller.notifyFileChanged(file);
		expect(guarded).toBe(false);
	});

	it("returns true when a field is dirty (caller must skip re-render)", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const guarded = controller.notifyFileChanged(file);
		expect(guarded).toBe(true);
	});

	it("returns true when a field is saving (async commit in flight)", async () => {
		let resolveCommit!: (v: { ok: true }) => void;
		const pendingCommit = new Promise<{ ok: true }>(r => { resolveCommit = r; });
		vi.spyOn(frontmatterWriter, "commit").mockReturnValue(pendingCommit as Promise<CommitResult>);

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();

		const guarded = controller.notifyFileChanged(file);
		expect(guarded).toBe(true);

		resolveCommit({ ok: true });
		await new Promise<void>(r => setTimeout(r, 0));
	});

	it("returns true when a field is in the ERROR state (write error — guard must survive failed commits)", async () => {
		// Regression guard: a narrowed implementation that only guards dirty/saving
		// would return false here and wipe the error message + edit on the next
		// metadataCache.changed event, losing the user's failed-write feedback.
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({
			ok: false,
			reason: "write",
			message: "Couldn't write frontmatter.",
			keepDirty: true,
		});

		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit]") as HTMLButtonElement;
		commitBtn.click();
		await new Promise<void>(r => setTimeout(r, 0));

		// Field is now in error state — guard must still fire
		const guarded = controller.notifyFileChanged(file);
		expect(guarded).toBe(true);
	});

	it("returns false for a different file — does not guard unrelated files", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const otherFile = makeFile("Other.md");
		const guarded = controller.notifyFileChanged(otherFile);
		expect(guarded).toBe(false);
	});

	it("integration: simulated SidebarView changed-handler skips re-render when guard fires", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const inputBefore = container.querySelector("input") as HTMLInputElement;

		let reRenderCalled = false;
		const simulatedChangedHandler = (f: TFile): void => {
			if (controller.notifyFileChanged(f)) return;
			reRenderCalled = true;
		};

		simulatedChangedHandler(file);

		expect(reRenderCalled).toBe(false);
		const inputAfter = container.querySelector("input") as HTMLInputElement;
		expect(inputAfter).toBe(inputBefore);
		expect(inputAfter.value).toBe("Ember");
	});

	it("integration: simulated SidebarView changed-handler proceeds when all fields are clean", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { controller } = buildController(app, file, ctx, [makeTextField("nickname")]);

		let reRenderCalled = false;
		const simulatedChangedHandler = (f: TFile): void => {
			if (controller.notifyFileChanged(f)) return;
			reRenderCalled = true;
		};

		simulatedChangedHandler(file);

		expect(reRenderCalled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// listener accumulation: listeners must not fire multiple times after re-render
// ---------------------------------------------------------------------------

describe("InspectorController: no listener accumulation across re-renders", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	it("input handler fires exactly once after two renders on the same container", () => {
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		const ctx = makeCtx(file, "character", { nickname: "Spark" });

		controller.render(container, ctx, [makeTextField("nickname")]);

		(container as unknown as { empty: () => void }).empty();
		controller.render(container, ctx, [makeTextField("nickname")]);

		const input = container.querySelector("input") as HTMLInputElement;
		input.value = "Fire";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtns = container.querySelectorAll("[data-sf-inspector-commit]");
		expect(commitBtns.length).toBe(1);
	});

	it("after teardown, listeners from the old render do not fire on the container", () => {
		const owner = makeOwner();
		const container = makeContainer();
		const controller = new InspectorController(app, owner);
		const ctx = makeCtx(file, "character", { nickname: "Spark" });

		controller.render(container, ctx, [makeTextField("nickname")]);
		controller.teardown();

		const input = container.querySelector("input") as HTMLInputElement | null;
		if (input) {
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}

		const commitBtn = container.querySelector("[data-sf-inspector-commit]");
		expect(commitBtn).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// T5.3 — Unified Inspector: read-only relation/list chips + each field once
// ---------------------------------------------------------------------------

describe("InspectorController: T5.3 unified detail — read-only relation/list fields", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
	});

	// -------------------------------------------------------------------------
	// Relation field: resolved link → stampLinkEl (sf-lrow-lnk), read-only
	// -------------------------------------------------------------------------

	it("relation field with resolved value → shows a read-only link chip (sf-lrow-lnk), no input control", () => {
		// Mock metadataCache to resolve the link
		const targetFile = makeFile("30 Canon/31 Characters/Mara Stoneway.md");
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(targetFile);

		const ctx = makeCtx(file, "character", { pov: "Mara Stoneway" });
		const { container } = buildController(app, file, ctx, [makeRelationField("pov")]);

		// No edit input
		const input = container.querySelector("input, select, textarea");
		expect(input).toBeNull();

		// A read-only link chip (stampLinkEl) should be present
		const chip = container.querySelector(".sf-lrow-lnk");
		expect(chip).not.toBeNull();
		// W1: the chip must carry the resolved file path in data-sf-link so the
		// SidebarView delegated body handler can route click events (AC-F8.1).
		expect(chip!.getAttribute("data-sf-link")).toBe(targetFile.path);
	});

	it("relation field: read-only chip is not an edit control (no input/select in DOM)", () => {
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		const ctx = makeCtx(file, "character", { partner: "[[Jonas Kell]]" });
		const { container } = buildController(app, file, ctx, [makeRelationField("partner")]);

		const input = container.querySelector("input, select");
		expect(input).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Unresolved [[link]] → unresolvedEl treatment: muted, non-clickable, not error
	// -------------------------------------------------------------------------

	it("relation field with unresolved value → renders muted unresolved treatment (sf-unres), not an error", () => {
		// getFirstLinkpathDest returns null by default → unresolved
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		const ctx = makeCtx(file, "character", { partner: "Nonexistent Ghost" });
		const { container } = buildController(app, file, ctx, [makeRelationField("partner")]);

		// No blocking error element
		const errorEl = container.querySelector("[data-sf-inspector-error]");
		expect(errorEl).toBeNull();

		// The muted unresolved treatment should be present (sf-unres)
		const unresolved = container.querySelector(".sf-unres, .sf-inspector-unresolved, [data-sf-inspector-unres]");
		expect(unresolved).not.toBeNull();
	});

	it("relation field unresolved → no clickable link (no data-sf-link attribute)", () => {
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		const ctx = makeCtx(file, "character", { partner: "Ghost" });
		const { container } = buildController(app, file, ctx, [makeRelationField("partner")]);

		// Must not have a data-sf-link (unresolved = non-routable)
		const link = container.querySelector("[data-sf-link]");
		expect(link).toBeNull();
	});

	// -------------------------------------------------------------------------
	// List field → read-only chips row, no edit control
	// -------------------------------------------------------------------------

	it("list field → read-only display, no input control", () => {
		const ctx = makeCtx(file, "character", { aliases: ["Spark", "Al"] });
		const { container } = buildController(app, file, ctx, [makeListField("aliases")]);

		const input = container.querySelector("input, select");
		expect(input).toBeNull();

		// Should have a field row (label present)
		expect(container.textContent).toContain("aliases");
	});

	it("list field with multiple values → all values visible in read-only form", () => {
		const ctx = makeCtx(file, "character", { allies: ["Tobias Ferro", "Jonas Kell"] });
		const { container } = buildController(app, file, ctx, [makeListField("allies")]);

		expect(container.textContent).toContain("Tobias Ferro");
		expect(container.textContent).toContain("Jonas Kell");
	});

	it("list field with [[wikilink]] items → resolved items become clickable link chips (data-sf-link)", () => {
		// Relation-style list (characters, plotlines, prev, next …) stored as
		// [[wikilinks]]. Resolved items must be clickable, not plain text.
		const mara = makeFile("30 Canon/31 Characters/Mara Stoneway.md");
		const jonas = makeFile("30 Canon/31 Characters/Jonas Kell.md");
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) => {
			if (link === "Mara Stoneway") return mara;
			if (link === "Jonas Kell") return jonas;
			return null;
		});

		const ctx = makeCtx(file, "scene", { characters: ["[[Mara Stoneway]]", "[[Jonas Kell]]"] });
		const { container } = buildController(app, file, ctx, [makeListField("characters")]);

		const links = container.querySelectorAll(".sf-lrow-lnk[data-sf-link]");
		expect(links.length).toBe(2);
		const paths = Array.from(links).map((l) => l.getAttribute("data-sf-link"));
		expect(paths).toContain(mara.path);
		expect(paths).toContain(jonas.path);
	});

	it("list field with plain (non-wikilink) items → stays non-clickable text chips", () => {
		// Plain string lists (aliases, distinctive_features) must NOT be linkified.
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		const ctx = makeCtx(file, "character", { aliases: ["Spark", "Al"] });
		const { container } = buildController(app, file, ctx, [makeListField("aliases")]);

		expect(container.querySelector("[data-sf-link]")).toBeNull();
		expect(container.textContent).toContain("Spark");
		expect(container.textContent).toContain("Al");
	});

	// -------------------------------------------------------------------------
	// Tags field → read-only, not editable
	// -------------------------------------------------------------------------

	it("tags field → read-only display, no input control", () => {
		const ctx = makeCtx(file, "character", { tags: ["canon/character"] });
		const { container } = buildController(app, file, ctx, [makeTagsField("tags")]);

		const input = container.querySelector("input, select");
		expect(input).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Fixed field → read-only, not editable
	// -------------------------------------------------------------------------

	it("fixed field → read-only display, no input control", () => {
		const ctx = makeCtx(file, "character", { type: "character" });
		const { container } = buildController(app, file, ctx, [makeFixedField("type")]);

		const input = container.querySelector("input, select");
		expect(input).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Each field ONCE: scalar editable + relation/list read-only, no duplication
	// -------------------------------------------------------------------------

	it("unified detail: scalar field has exactly ONE input, not two", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark" });
		const { container } = buildController(app, file, ctx, [makeTextField("nickname")]);

		const inputs = container.querySelectorAll("input[data-sf-inspector-input='nickname']");
		expect(inputs.length).toBe(1);
	});

	it("unified detail: mixed fields — each scalar has one editable input, each relation has one read-only row", () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark", pov: "[[Mara]]" });
		const fields = [makeTextField("nickname"), makeRelationField("pov")];
		const { container } = buildController(app, file, ctx, fields);

		// Exactly one editable input for the scalar
		const inputs = container.querySelectorAll("[data-sf-inspector-input]");
		expect(inputs.length).toBe(1);

		// No input for the relation field
		const allInputs = container.querySelectorAll("input, select");
		expect(allInputs.length).toBe(1); // only the scalar input

		// Relation label present
		expect(container.textContent).toContain("pov");
	});

	it("unified detail: editable scalar/enum commit/dirty still works when relation fields also rendered", async () => {
		const ctx = makeCtx(file, "character", { nickname: "Spark", pov: "[[Mara]]" });
		const fields = [makeTextField("nickname"), makeRelationField("pov")];
		const { container } = buildController(app, file, ctx, fields);

		const input = container.querySelector("[data-sf-inspector-input='nickname']") as HTMLInputElement;
		input.value = "Ember";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		const commitBtn = container.querySelector("[data-sf-inspector-commit='nickname']");
		expect(commitBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// A boolean over an absent value (T6.3)
// ---------------------------------------------------------------------------

describe("InspectorController: a boolean field", () => {
	function renderBoolean(frontmatter: Record<string, unknown>): HTMLElement {
		const file = makeFile();
		const { container } = buildController(makeApp(), file, makeCtx(file, "character", frontmatter), [
			{ name: "alive", type: "boolean" },
		]);
		return container;
	}

	function toggle(container: HTMLElement): void {
		const box = container.querySelector<HTMLInputElement>("input[type='checkbox']");
		if (!box) throw new Error("no checkbox");
		box.checked = !box.checked;
		box.dispatchEvent(new Event("input", { bubbles: true }));
	}

	const saveButton = (container: HTMLElement): Element | null => container.querySelector("[data-sf-inspector-commit]");

	it.each([["absent", {}], ["null", { alive: null }], ["empty-string", { alive: "" }]])(
		"checking then unchecking over a(n) %s value is clean, and offers nothing to save",
		(_label, frontmatter) => {
			const container = renderBoolean(frontmatter);

			toggle(container);
			expect(saveButton(container)).not.toBeNull();

			toggle(container);
			expect(saveButton(container)).toBeNull();
		},
	);

	it("writes nothing for that round trip", () => {
		const commitSpy = vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });
		const container = renderBoolean({});
		toggle(container);
		toggle(container);

		expect(saveButton(container)).toBeNull();
		expect(commitSpy).not.toHaveBeenCalled();
		commitSpy.mockRestore();
	});

	it("still marks unchecking a stored true as an edit", () => {
		const container = renderBoolean({ alive: true });
		toggle(container);
		expect(saveButton(container)).not.toBeNull();
	});

	it("still marks checking a stored false as an edit", () => {
		const container = renderBoolean({ alive: false });
		toggle(container);
		expect(saveButton(container)).not.toBeNull();
	});

	it("shows a string \"true\" as what the file holds, with no checkbox to misreport it", () => {
		const container = renderBoolean({ alive: "true" });

		expect(container.querySelector("input[type='checkbox']")).toBeNull();
		expect(container.querySelector(".sf-inspector-readonly-value")?.textContent).toBe("true");
	});
});
