/**
 * frontmatterWriter.commitMany tests — T2.1 (RED first, per TDD).
 *
 * Tests:
 *  - all entries valid → single processFrontMatter call setting ALL keys
 *  - sibling keys not in entries are untouched
 *  - any type error → zero processFrontMatter calls (validates in memory first)
 *  - out-of-vocab select → advisory warn, write proceeds
 *  - processFrontMatter rejects → {ok:false, reason:"write", keepDirty:true}
 *  - empty entries array → no-op {ok:true}, zero processFrontMatter calls
 *
 * Empty-entries contract: short-circuit to {ok:true} without calling
 * processFrontMatter. Rationale: nothing to validate, nothing to write;
 * an atomic write of zero keys is equivalent to no write. Callers that
 * need a round-trip fence can use commit() directly.
 *
 * @ref SDD/ADR-14 — commitMany atomic multi-key write
 * @ref PRD/AC-F7.1 — validation-blocks-all
 * @ref PRD/AC-F7.2 — write-error path returns keepDirty
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile } from "../__mocks__/obsidian";
import { commitMany } from "inspector/frontmatterWriter";
import type { CommitEntry } from "inspector/frontmatterWriter";

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

function makeTextEntry(key = "nickname", value: unknown = "Spark"): CommitEntry {
	return { key, value, field: { name: key, type: "text" } };
}

function makeNumberEntry(key = "age", value: unknown = 30): CommitEntry {
	return { key, value, field: { name: key, type: "number" } };
}

function makeSelectEntry(
	key = "role",
	value: unknown = "protagonist",
	values = ["protagonist", "antagonist", "supporting"],
): CommitEntry {
	return { key, value, field: { name: key, type: "select", values } };
}

// ---------------------------------------------------------------------------
// commitMany
// ---------------------------------------------------------------------------

describe("commitMany", () => {
	let app: App;
	let file: TFile;

	beforeEach(() => {
		app = makeApp();
		file = makeFile();
		// Default: processFrontMatter resolves successfully
		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);
	});

	// --- Happy path: all valid entries ---

	it("all valid entries → calls processFrontMatter exactly once", async () => {
		const entries = [makeTextEntry("nickname", "Spark"), makeNumberEntry("age", 25)];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(
			file,
			expect.any(Function),
		);
	});

	it("all valid entries → mutator sets ALL keys in the single call", async () => {
		const entries = [makeTextEntry("nickname", "Spark"), makeNumberEntry("age", 25)];
		let captured: Record<string, unknown> = {};

		vi.mocked(app.fileManager.processFrontMatter).mockImplementation(
			async (_file, fn) => {
				captured = {};
				fn(captured);
			},
		);

		await commitMany(app, file, entries);

		expect(captured["nickname"]).toBe("Spark");
		expect(captured["age"]).toBe(25);
	});

	it("sibling keys not in entries are untouched", async () => {
		const entries = [makeTextEntry("nickname", "Spark")];
		let captured: Record<string, unknown> = { age: 99, role: "protagonist" };

		vi.mocked(app.fileManager.processFrontMatter).mockImplementation(
			async (_file, fn) => {
				fn(captured);
			},
		);

		await commitMany(app, file, entries);

		// Only the entry key was set
		expect(captured["nickname"]).toBe("Spark");
		// Siblings are untouched
		expect(captured["age"]).toBe(99);
		expect(captured["role"]).toBe("protagonist");
	});

	it("single entry → still a single processFrontMatter call", async () => {
		const entries = [makeSelectEntry("role", "antagonist")];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	// --- Empty entries: short-circuit no-op ---

	it("empty entries array → returns {ok:true} without calling processFrontMatter", async () => {
		const result = await commitMany(app, file, []);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	// --- Validation: all-or-nothing ---

	it("one type error → returns {ok:false, reason:'validation', keepDirty:true}", async () => {
		const entries = [
			makeTextEntry("nickname", "Spark"),
			makeNumberEntry("age", "twelve"), // invalid: string on number field
		];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({
			ok: false,
			reason: "validation",
			keepDirty: true,
			message: expect.any(String),
		});
	});

	it("any type error → processFrontMatter called zero times (all-or-nothing)", async () => {
		const entries = [
			makeTextEntry("nickname", "Spark"),
			makeNumberEntry("age", "twelve"), // invalid
		];
		await commitMany(app, file, entries);

		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("all type errors → validation blocks (returns first error), zero writes", async () => {
		const entries = [
			makeNumberEntry("age", NaN),         // invalid: NaN
			makeTextEntry("nickname", { bad: 1 }), // invalid: object on text
		];
		const result = await commitMany(app, file, entries);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("validation");
			expect(result.keepDirty).toBe(true);
		}
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("null value on any field → valid (clearing a field), proceeds to write", async () => {
		const entries = [makeTextEntry("nickname", null), makeNumberEntry("age", null)];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	// --- Out-of-vocab select (advisory warn, never block) ---

	it("out-of-vocab select → processFrontMatter called, returns {ok:true}", async () => {
		const entries = [makeSelectEntry("role", "sidekick", ["protagonist", "antagonist"])];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({ ok: true });
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	it("out-of-vocab select → advisory warn fires with field name and value", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const entries = [makeSelectEntry("role", "sidekick", ["protagonist", "antagonist"])];
			await commitMany(app, file, entries);

			expect(warnSpy).toHaveBeenCalledTimes(1);
			const [warnMsg] = warnSpy.mock.calls[0] as [string];
			expect(warnMsg).toContain("role");
			expect(warnMsg).toContain("sidekick");
		} finally {
			warnSpy.mockRestore();
		}
	});

	// --- Write error path ---

	it("processFrontMatter rejects → returns {ok:false, reason:'write', keepDirty:true}", async () => {
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("vault locked"),
		);
		const entries = [makeTextEntry("nickname", "Spark")];
		const result = await commitMany(app, file, entries);

		expect(result).toEqual({
			ok: false,
			reason: "write",
			keepDirty: true,
			message: expect.any(String),
		});
	});

	it("write error includes a user-facing message string", async () => {
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("disk full"),
		);
		const entries = [makeTextEntry("nickname", "Spark")];
		const result = await commitMany(app, file, entries);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(typeof result.message).toBe("string");
			expect(result.message.length).toBeGreaterThan(0);
		}
	});
});
