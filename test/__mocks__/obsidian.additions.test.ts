/**
 * Self-tests for the spec 009 additions to the Obsidian mock: parseYaml,
 * stringifyYaml, Keymap.isModifier, Platform.isMacOS, Tasks, and the
 * Debouncer.run rename (was `flush`). Shapes follow obsidian.d.ts (CON-7).
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { parse } from "yaml";
import { Keymap, Platform, Tasks, debounce, parseYaml, stringifyYaml } from "obsidian";

type Mods = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
const keyEvent = (mods: Mods): KeyboardEvent => mods as unknown as KeyboardEvent;
const setMac = (v: boolean): void => {
	(Platform as { isMacOS: boolean }).isMacOS = v;
};

describe("parseYaml / stringifyYaml", () => {
	const samples: Array<[string, unknown]> = [
		["a string", { title: "Hello: world" }],
		["numbers", { n: 42, f: 1.5 }],
		["a list", { tags: ["a", "b", "c"] }],
		["nested maps", { a: { b: { c: [1, { d: "x" }] } } }],
		["null", { empty: null }],
	];

	it.each(samples)("round-trips %s", (_label, value) => {
		expect(parseYaml(stringifyYaml(value))).toEqual(value);
	});

	it("parseYaml agrees with the yaml package", () => {
		const text = "a: 1\nb:\n  - x\n  - y\nc: null\n";
		expect(parseYaml(text)).toEqual(parse(text));
	});

	it("stringifyYaml emits block YAML with a trailing newline", () => {
		expect(stringifyYaml({ a: 1 })).toBe("a: 1\n");
	});
});

describe("Keymap.isModifier", () => {
	afterEach(() => setMac(false));

	it("treats Mod as meta on macOS and ignores ctrl", () => {
		setMac(true);
		expect(Keymap.isModifier(keyEvent({ metaKey: true }), "Mod")).toBe(true);
		expect(Keymap.isModifier(keyEvent({ ctrlKey: true }), "Mod")).toBe(false);
	});

	it("treats Mod as ctrl elsewhere and ignores meta", () => {
		setMac(false);
		expect(Keymap.isModifier(keyEvent({ ctrlKey: true }), "Mod")).toBe(true);
		expect(Keymap.isModifier(keyEvent({ metaKey: true }), "Mod")).toBe(false);
	});

	it("maps Ctrl, Meta, Shift and Alt to their own flags", () => {
		expect(Keymap.isModifier(keyEvent({ ctrlKey: true }), "Ctrl")).toBe(true);
		expect(Keymap.isModifier(keyEvent({ metaKey: true }), "Meta")).toBe(true);
		expect(Keymap.isModifier(keyEvent({ shiftKey: true }), "Shift")).toBe(true);
		expect(Keymap.isModifier(keyEvent({ altKey: true }), "Alt")).toBe(true);
		expect(Keymap.isModifier(keyEvent({}), "Shift")).toBe(false);
		expect(Keymap.isModifier(keyEvent({ shiftKey: true }), "Alt")).toBe(false);
	});
});

describe("Platform.isMacOS", () => {
	it("defaults to false on a freshly loaded mock, like the other Platform flags", async () => {
		vi.resetModules();
		const fresh = await import("obsidian");
		expect(fresh.Platform.isMacOS).toBe(false);
	});
});

describe("Debouncer.run", () => {
	afterEach(() => vi.useRealTimers());

	it("runs the pending call once, immediately, and clears it", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const d = debounce(fn, 1000);
		d("a");
		d("b");
		d.run();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("b");
		vi.advanceTimersByTime(5000);
		expect(fn).toHaveBeenCalledTimes(1);
		d.run();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("no longer exposes the fictional flush member", () => {
		const d = debounce(() => undefined, 10);
		expect("flush" in d).toBe(false);
		expect(typeof d.run).toBe("function");
	});
});

describe("Tasks", () => {
	it("collects the promises a quit listener adds, via add and addPromise", async () => {
		const tasks = new Tasks();
		expect(tasks.isEmpty()).toBe(true);
		const done: string[] = [];
		tasks.add(async () => {
			await new Promise((r) => setTimeout(r, 5));
			done.push("cb");
		});
		tasks.addPromise(
			Promise.resolve().then(() => {
				done.push("p");
			}),
		);
		expect(tasks.isEmpty()).toBe(false);
		await tasks.promise();
		expect(done.sort()).toEqual(["cb", "p"]);
	});

	it("promise() rejects when an added task rejects", async () => {
		const tasks = new Tasks();
		tasks.addPromise(Promise.reject(new Error("boom")));
		await expect(tasks.promise()).rejects.toThrow("boom");
	});
});
