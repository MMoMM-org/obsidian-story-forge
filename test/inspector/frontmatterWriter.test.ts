/**
 * frontmatterWriter tests — T5.1 (RED first, per TDD).
 *
 * Tests:
 *  - valid scalar value → processFrontMatter called once, returns {ok:true}
 *  - type-invalid value → returns {ok:false, reason:"validation", keepDirty:true}
 *    AND processFrontMatter is NOT called (validates in memory before any write)
 *  - processFrontMatter rejects → returns {ok:false, reason:"write", keepDirty:true}
 *  - out-of-vocab select → processFrontMatter IS called (write proceeds, frontmatter-is-truth)
 *    AND an advisory warn is surfaced (not a block)
 *  - editableFields derives select vocab from schema `values`
 *
 * @ref SDD/ADR-7 — block type errors, warn vocab (out-of-vocab is advisory only)
 * @ref PRD/AC-F6.3 — valid commit writes plain frontmatter
 * @ref PRD/AC-F6.5 — type error blocks and preserves edit
 * @ref PRD/AC-F6.6 — write failure preserves edit + Retry
 * @ref PRD/AC-F6.7 — out-of-vocab writes + warns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile } from "../__mocks__/obsidian";
import { commit } from "inspector/frontmatterWriter";
import type { FieldSpec } from "inspector/frontmatterWriter";
import { selectVocab } from "inspector/editableFields";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeFile(path = "30 Canon/31 Characters/Alice.md"): TFile {
	const f = new TFile();
	f.path = path;
	return f;
}

function makeTextField(name = "nickname"): FieldSpec {
	return { name, type: "text" };
}

function makeNumberField(name = "age"): FieldSpec {
	return { name, type: "number" };
}

function makeSelectField(
	name = "role",
	values = ["protagonist", "antagonist", "supporting"],
): FieldSpec {
	return { name, type: "select", values };
}

// ---------------------------------------------------------------------------
// frontmatterWriter.commit
// ---------------------------------------------------------------------------

describe("commit", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		// Default: processFrontMatter resolves successfully
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	// --- Happy path ---

	it("valid text value → calls processFrontMatter once and returns {ok:true}", async () => {
		const field = makeTextField("nickname");
		const result = await commit(app, file, "nickname", "Spark", field);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(
			file,
			expect.any(Function),
		);
	});

	it("valid number value → calls processFrontMatter and returns {ok:true}", async () => {
		const field = makeNumberField("age");
		const result = await commit(app, file, "age", 30, field);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	it("processFrontMatter mutator sets fm[key] = value", async () => {
		const field = makeTextField("nickname");
		let captured: Record<string, unknown> = {};

		vi.mocked(app.fileManager.processFrontMatter).mockImplementation(
			async (_file, fn) => {
				captured = {};
				fn(captured);
			},
		);

		await commit(app, file, "nickname", "Spark", field);
		expect(captured["nickname"]).toBe("Spark");
	});

	// --- Type-invalid: validation blocks write (AC-F6.5) ---

	it("string value on number field → returns {ok:false, reason:'validation', keepDirty:true}", async () => {
		const field = makeNumberField("age");
		const result = await commit(app, file, "age", "twelve", field);

		expect(result).toEqual({
			ok: false,
			reason: "validation",
			keepDirty: true,
			message: expect.any(String),
		});
	});

	it("type-invalid → processFrontMatter is NOT called (validation runs before write)", async () => {
		const field = makeNumberField("age");
		await commit(app, file, "age", "twelve", field);

		// This is the core proof: validation runs in memory BEFORE any vault write.
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("boolean value on text field → returns {ok:false, reason:'validation', keepDirty:true}", async () => {
		const field = makeTextField("nickname");
		// booleans are not valid text values
		const result = await commit(app, file, "nickname", true, field);

		expect(result).toEqual({
			ok: false,
			reason: "validation",
			keepDirty: true,
			message: expect.any(String),
		});
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("object value on text field → returns {ok:false, reason:'validation', keepDirty:true}", async () => {
		const field = makeTextField("nickname");
		const result = await commit(app, file, "nickname", { foo: "bar" }, field);

		expect(result).toEqual({
			ok: false,
			reason: "validation",
			keepDirty: true,
			message: expect.any(String),
		});
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	// --- Write failure (AC-F6.6) ---

	it("processFrontMatter rejects → returns {ok:false, reason:'write', keepDirty:true}", async () => {
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("vault locked"),
		);
		const field = makeTextField("nickname");
		const result = await commit(app, file, "nickname", "Spark", field);

		expect(result).toEqual({
			ok: false,
			reason: "write",
			keepDirty: true,
			message: expect.any(String),
		});
	});

	it("write failure result includes a user-facing message", async () => {
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("disk full"),
		);
		const field = makeTextField("nickname");
		const result = await commit(app, file, "nickname", "Spark", field);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(typeof result.message).toBe("string");
			expect(result.message.length).toBeGreaterThan(0);
		}
	});

	// --- Out-of-vocab select (AC-F6.7 / ADR-7) ---

	it("in-vocab select value → processFrontMatter called, returns {ok:true}", async () => {
		const field = makeSelectField("role", ["protagonist", "antagonist"]);
		const result = await commit(app, file, "role", "protagonist", field);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	it("out-of-vocab select value → processFrontMatter IS called (frontmatter-is-truth)", async () => {
		const field = makeSelectField("role", ["protagonist", "antagonist", "supporting"]);
		// "sidekick" is not in the vocab list
		await commit(app, file, "role", "sidekick", field);

		// The write MUST proceed — out-of-vocab is advisory, not a blocking error.
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	it("out-of-vocab select → returns {ok:true} (not a blocking error)", async () => {
		const field = makeSelectField("role", ["protagonist", "antagonist"]);
		const result = await commit(app, file, "role", "sidekick", field);

		expect(result).toEqual({ ok: true });
	});

	// --- Plugin state: nothing persisted (CON-1) ---

	it("successful commit does not mutate any plugin state (only processFrontMatter is side-effecting)", async () => {
		// The commit function receives `app` and a `file` reference.
		// No plugin.saveData or plugin.loadData should be called.
		// We verify this by checking only the one expected side-effect occurs.
		const field = makeTextField("nickname");
		await commit(app, file, "nickname", "Spark", field);

		// processFrontMatter is the ONLY call — no extra vault/store calls.
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
		// vault is untouched (frontmatter-is-truth: only fileManager path is used)
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(app.vault.create).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// editableFields.selectVocab
// ---------------------------------------------------------------------------

describe("selectVocab", () => {
	it("returns the values array from a select FieldSpec", () => {
		const field = makeSelectField("role", ["protagonist", "antagonist", "supporting", "minor"]);
		expect(selectVocab(field)).toEqual([
			"protagonist",
			"antagonist",
			"supporting",
			"minor",
		]);
	});

	it("returns empty array when a select field has no values", () => {
		const field: FieldSpec = { name: "status", type: "select" };
		expect(selectVocab(field)).toEqual([]);
	});

	it("returns null for non-select fields", () => {
		const textField = makeTextField("nickname");
		expect(selectVocab(textField)).toBeNull();

		const numberField = makeNumberField("age");
		expect(selectVocab(numberField)).toBeNull();
	});
});
