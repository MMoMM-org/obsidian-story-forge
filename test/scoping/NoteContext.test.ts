/**
 * Tests for the engine-free NoteContext guards (isEntityKind, isNoteContext).
 * Pure data — no Obsidian instance required.
 */

import { describe, expect, it } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import {
	isEntityKind,
	isNoteContext,
	type NoteContext,
} from "../../src/scoping/NoteContext";

describe("isEntityKind", () => {
	it("accepts every valid EntityKind", () => {
		for (const kind of [
			"character",
			"location",
			"object",
			"lore",
			"scene",
			"plotline",
			"book",
			"unknown",
		]) {
			expect(isEntityKind(kind)).toBe(true);
		}
	});

	it("rejects unknown strings and non-strings", () => {
		expect(isEntityKind("banana")).toBe(false);
		expect(isEntityKind("")).toBe(false);
		expect(isEntityKind(42)).toBe(false);
		expect(isEntityKind(null)).toBe(false);
		expect(isEntityKind(undefined)).toBe(false);
	});
});

describe("isNoteContext", () => {
	function validContext(): NoteContext {
		return {
			activeFile: createMockTFile({ path: "scene.md" }),
			activeKind: "scene",
			entities: [],
			backlinks: [],
			frontmatter: {},
			resolvedAt: 1234,
		};
	}

	it("returns true for a valid NoteContext (happy path)", () => {
		expect(isNoteContext(validContext())).toBe(true);
	});

	it("rejects a context with an invalid activeKind", () => {
		const ctx = { ...validContext(), activeKind: "banana" };
		expect(isNoteContext(ctx)).toBe(false);
	});

	it("rejects a context with a missing activeFile", () => {
		const ctx = { ...validContext(), activeFile: undefined };
		expect(isNoteContext(ctx)).toBe(false);
	});

	it("rejects non-object values", () => {
		expect(isNoteContext(null)).toBe(false);
		expect(isNoteContext("nope")).toBe(false);
		expect(isNoteContext(undefined)).toBe(false);
	});

	it("rejects a context with non-array entities/backlinks or bad resolvedAt", () => {
		expect(isNoteContext({ ...validContext(), entities: "no" })).toBe(false);
		expect(isNoteContext({ ...validContext(), backlinks: null })).toBe(false);
		expect(isNoteContext({ ...validContext(), resolvedAt: "soon" })).toBe(
			false,
		);
	});
});
