import { describe, expect, it } from "vitest";
import { deepEqual, normalise, slotOf, slotsEqual, valueSize } from "../../src/undo/yamlValue";
import type { Slot } from "../../src/undo/journalTypes";

const present = (value: unknown): Slot => ({ present: true, value });
const ABSENT: Slot = { present: false };

describe("normalise", () => {
	it("keeps a date-looking string a string", () => {
		expect(normalise("2024-01-05")).toBe("2024-01-05");
	});

	it("keeps a numeric-looking string a string", () => {
		expect(normalise("1.0")).toBe("1.0");
	});

	it("turns the number 1.0 into 1", () => {
		expect(normalise(1.0)).toBe(1);
	});

	it("round-trips nested maps and lists", () => {
		const value = { a: { b: [1, "x", { c: true }] }, d: null };
		expect(normalise(value)).toEqual(value);
	});

	it("returns a copy, not the input", () => {
		const value = { list: ["a"] };
		const result = normalise(value) as { list: string[] };
		result.list.push("b");
		expect(value.list).toEqual(["a"]);
	});

	it("maps undefined to null", () => {
		expect(normalise(undefined)).toBeNull();
	});
});

describe("slotOf", () => {
	it("reports a missing key as absent", () => {
		expect(slotOf({}, "status")).toEqual({ present: false });
	});

	it("reports a key holding undefined as absent", () => {
		expect(slotOf({ status: undefined }, "status")).toEqual({ present: false });
	});

	it("reports null as present with a null value", () => {
		expect(slotOf({ status: null }, "status")).toEqual({ present: true, value: null });
	});

	it("reports an empty string as present", () => {
		expect(slotOf({ status: "" }, "status")).toEqual({ present: true, value: "" });
	});

	it("reports an empty list as present", () => {
		expect(slotOf({ aliases: [] }, "aliases")).toEqual({ present: true, value: [] });
	});

	it("does not see inherited properties", () => {
		const fm = Object.create({ status: "inherited" }) as Record<string, unknown>;
		expect(slotOf(fm, "status")).toEqual({ present: false });
	});

	it("stores a normalised copy", () => {
		const list = ["a"];
		const slot = slotOf({ aliases: list }, "aliases");
		expect(slot).toEqual({ present: true, value: ["a"] });
		expect(slot.present && slot.value).not.toBe(list);
	});
});

describe("slotsEqual", () => {
	it("treats absent as equal to absent", () => {
		expect(slotsEqual(ABSENT, ABSENT)).toBe(true);
	});

	it("treats absent as different from null", () => {
		expect(slotsEqual(ABSENT, present(null))).toBe(false);
	});

	it("treats null, empty string and empty list as three different values", () => {
		expect(slotsEqual(present(null), present(""))).toBe(false);
		expect(slotsEqual(present(""), present([]))).toBe(false);
		expect(slotsEqual(present(null), present([]))).toBe(false);
	});

	it("compares arrays in order", () => {
		expect(slotsEqual(present(["a", "b"]), present(["a", "b"]))).toBe(true);
		expect(slotsEqual(present(["a", "b"]), present(["b", "a"]))).toBe(false);
	});

	it("ignores map key order", () => {
		expect(slotsEqual(present({ a: 1, b: { c: 2, d: 3 } }), present({ b: { d: 3, c: 2 }, a: 1 }))).toBe(true);
	});

	it("tells maps with different keys apart", () => {
		expect(slotsEqual(present({ a: 1 }), present({ a: 1, b: 2 }))).toBe(false);
		expect(slotsEqual(present({ a: 1, b: 2 }), present({ a: 1 }))).toBe(false);
	});

	it("does not coerce between types", () => {
		expect(slotsEqual(present(1), present("1"))).toBe(false);
		expect(slotsEqual(present(true), present("true"))).toBe(false);
	});
});

describe("deepEqual", () => {
	it("treats 0 and -0 as equal", () => {
		expect(deepEqual(0, -0)).toBe(true);
	});

	it("treats NaN as equal to NaN", () => {
		expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
	});

	it("does not equate an array with a map", () => {
		expect(deepEqual([], {})).toBe(false);
	});

	it("does not equate maps whose keys differ even when the sizes match", () => {
		expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
	});

	it("does not equate an array with null or with a map that has a length key", () => {
		expect(deepEqual([], null)).toBe(false);
		expect(deepEqual([], { length: 0 })).toBe(false);
	});

	it("does not equate an array with its own prefix", () => {
		expect(deepEqual([1], [1, 2])).toBe(false);
		expect(deepEqual([1, 2], [1])).toBe(false);
	});

	it("does not equate null with an empty map", () => {
		expect(deepEqual(null, {})).toBe(false);
	});
});

describe("valueSize", () => {
	it("is zero for an absent slot", () => {
		expect(valueSize(ABSENT)).toBe(0);
	});

	it("is the length of the JSON text of the value", () => {
		expect(valueSize(present("abc"))).toBe(5);
		expect(valueSize(present(["a", "b"]))).toBe(9);
		expect(valueSize(present(null))).toBe(4);
	});
});
