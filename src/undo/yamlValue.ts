/**
 * yamlValue — compare frontmatter values in the form Obsidian will store (ADR-41).
 *
 * Both sides of every comparison go through `parseYaml(stringifyYaml(...))`,
 * so quoting or spacing never looks like a change, and the same parser decides
 * what a date-like value is. `undefined` means the key is absent.
 */
import { parseYaml, stringifyYaml } from "obsidian";
import type { Slot } from "./journalTypes";

/** The stored form of a value. A bare scalar is wrapped so it takes the same path as a key's value. */
export function normalise(v: unknown): unknown {
	const parsed = parseYaml(stringifyYaml({ v })) as { v?: unknown } | null;
	return parsed?.v ?? null;
}

/** The slot of `key` in `fm`: absent when missing or undefined, else a normalised copy. */
export function slotOf(fm: Record<string, unknown>, key: string): Slot {
	if (!Object.prototype.hasOwnProperty.call(fm, key) || fm[key] === undefined) return { present: false };
	return { present: true, value: normalise(fm[key]) };
}

/** Structural equality: ordered arrays, plain objects by own keys, primitives by Object.is except 0/-0. */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b);
	if (isPlainObject(a) && isPlainObject(b)) return objectsEqual(a, b);
	return Object.is(a, b) || (a === 0 && b === 0);
}

export function slotsEqual(a: Slot, b: Slot): boolean {
	if (!a.present || !b.present) return a.present === b.present;
	return deepEqual(a.value, b.value);
}

/** Length of the JSON text of a slot's value; an absent slot is 0 (ADR-48 MAX_VALUE_CHARS). */
export function valueSize(slot: Slot): number {
	if (!slot.present) return 0;
	return (JSON.stringify(slot.value) ?? "").length;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((item, i) => deepEqual(item, b[i]));
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
