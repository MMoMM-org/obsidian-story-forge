/**
 * BasesAdapter tests — T1.1 (cache-at-onload contract, RED first).
 *
 * Contract:
 *   - registerCodexView(plugin) — the SINGLE onload registration. Calls
 *     registerBasesView EXACTLY ONCE, caches the boolean result in a
 *     WeakMap<Plugin, boolean>, and returns it. Idempotent: subsequent calls
 *     return the cached value without re-calling registerBasesView.
 *
 *   - isBasesAvailable(plugin) — returns the cached availability boolean.
 *     Must NOT call registerBasesView. Returns false if registerCodexView
 *     has not run yet (default).
 *
 * Tests prove:
 *   - isBasesAvailable returns false BEFORE registerCodexView has run.
 *   - After registerCodexView (Bases enabled) → isBasesAvailable returns true.
 *   - After registerCodexView (Bases disabled) → isBasesAvailable returns false.
 *   - registerCodexView calls registerBasesView EXACTLY ONCE even across
 *     multiple registerCodexView calls (idempotent).
 *   - isBasesAvailable calls registerBasesView ZERO times (no side effect).
 *   - registerCodexView when method absent → returns false, caches false.
 *   - WeakMap scoping: distinct plugin instances don't leak into each other.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, Plugin } from "../__mocks__/obsidian";
import { isBasesAvailable, registerCodexView } from "bases/BasesAdapter";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Wire a spy registerBasesView onto a Plugin instance.
 * Returns the spy so tests can assert call count.
 */
function wireRegisterBasesView(plugin: Plugin, returnValue: boolean): ReturnType<typeof vi.fn> {
	const spy = vi.fn(() => returnValue);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(plugin as any).registerBasesView = spy;
	return spy;
}

// ---------------------------------------------------------------------------
// isBasesAvailable — default (before registerCodexView)
// ---------------------------------------------------------------------------

describe("isBasesAvailable", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("returns false BEFORE registerCodexView has run (default cache)", () => {
		// Bases method is present on plugin but registerCodexView was never called.
		wireRegisterBasesView(plugin, true);

		expect(isBasesAvailable(plugin)).toBe(false);
	});

	it("returns false when registerBasesView is absent AND registerCodexView not called", () => {
		// No method wired, no registration — must default false.
		expect(isBasesAvailable(plugin)).toBe(false);
	});

	it("calls registerBasesView ZERO times (no per-render side effect)", () => {
		const spy = wireRegisterBasesView(plugin, true);

		// Even after multiple calls, isBasesAvailable must never call the spy.
		isBasesAvailable(plugin);
		isBasesAvailable(plugin);
		isBasesAvailable(plugin);

		expect(spy).toHaveBeenCalledTimes(0);
	});

	it("returns true after registerCodexView when Bases is enabled", () => {
		wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		expect(isBasesAvailable(plugin)).toBe(true);
	});

	it("returns false after registerCodexView when Bases is disabled", () => {
		wireRegisterBasesView(plugin, false);

		registerCodexView(plugin);

		expect(isBasesAvailable(plugin)).toBe(false);
	});

	it("reflects the value cached at registerCodexView time — not re-evaluated later", () => {
		const spy = vi.fn()
			.mockReturnValueOnce(true)   // first call (from registerCodexView)
			.mockReturnValueOnce(false); // subsequent calls (must NOT be reached)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		registerCodexView(plugin);

		// isBasesAvailable must return the cached true — not call the spy again.
		expect(isBasesAvailable(plugin)).toBe(true);
		expect(isBasesAvailable(plugin)).toBe(true);

		// Only the one call from registerCodexView.
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("WeakMap scoping: one plugin's availability does not bleed into another", () => {
		const plugin2 = new Plugin(new App());
		wireRegisterBasesView(plugin, true);
		wireRegisterBasesView(plugin2, false);

		registerCodexView(plugin);
		registerCodexView(plugin2);

		expect(isBasesAvailable(plugin)).toBe(true);
		expect(isBasesAvailable(plugin2)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// registerCodexView
// ---------------------------------------------------------------------------

describe("registerCodexView", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("returns true when Bases is enabled (registerBasesView returns true)", () => {
		wireRegisterBasesView(plugin, true);

		const result = registerCodexView(plugin);

		expect(result).toBe(true);
	});

	it("returns false when Bases is disabled (registerBasesView returns false)", () => {
		wireRegisterBasesView(plugin, false);

		const result = registerCodexView(plugin);

		expect(result).toBe(false);
	});

	it("returns false when registerBasesView is not present on plugin", () => {
		const result = registerCodexView(plugin);

		expect(result).toBe(false);
	});

	it("calls registerBasesView EXACTLY ONCE on the first call", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("calls registerBasesView with story-forge-codex viewId and valid registration", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		expect(spy).toHaveBeenCalledWith(
			"story-forge-codex",
			expect.objectContaining({ name: expect.any(String), factory: expect.any(Function) }),
		);
	});

	it("is idempotent — does NOT call registerBasesView again on subsequent calls", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);
		registerCodexView(plugin);
		registerCodexView(plugin);

		// registerBasesView must be called exactly once regardless of how many
		// times registerCodexView is invoked.
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("idempotent — returns the cached value on subsequent calls without re-registering", () => {
		wireRegisterBasesView(plugin, true);

		const first = registerCodexView(plugin);
		const second = registerCodexView(plugin);
		const third = registerCodexView(plugin);

		expect(first).toBe(true);
		expect(second).toBe(true);
		expect(third).toBe(true);
	});

	it("caches false from absent method — second call still returns false without method", () => {
		// No method wired: first call caches false.
		const first = registerCodexView(plugin);
		// Wire a method AFTER: second call must still return cached false.
		wireRegisterBasesView(plugin, true);
		const second = registerCodexView(plugin);

		expect(first).toBe(false);
		expect(second).toBe(false);
	});

	it("returns false and caches false when registerBasesView throws", () => {
		// Wire a spy that throws — simulating an unexpected runtime error from
		// the Bases runtime (e.g. internal validation failure).
		const spy = vi.fn(() => { throw new Error("bases internal error"); });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		const result = registerCodexView(plugin);

		expect(result).toBe(false);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("does NOT call registerBasesView again after a throw (exactly-once invariant holds)", () => {
		const spy = vi.fn(() => { throw new Error("bases internal error"); });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		registerCodexView(plugin);          // first call — throws, caches false
		const second = registerCodexView(plugin); // second call — must use cache

		expect(spy).toHaveBeenCalledTimes(1);
		expect(second).toBe(false);
	});
});
