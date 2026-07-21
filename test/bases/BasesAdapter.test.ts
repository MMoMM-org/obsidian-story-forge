/**
 * BasesAdapter tests — T1.1 (RED first).
 *
 * Tests:
 *  - isBasesAvailable returns true when registerBasesView returns true (Bases enabled)
 *  - isBasesAvailable returns false when registerBasesView returns false (Bases disabled)
 *  - isBasesAvailable is re-evaluated per call (never cached)
 *  - isBasesAvailable returns false when plugin lacks registerBasesView
 *  - registerCodexView returns availability boolean from registerBasesView
 *  - registerCodexView returns false when Bases unavailable
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, Plugin } from "../__mocks__/obsidian";
import { isBasesAvailable, registerCodexView } from "bases/BasesAdapter";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Wire a mock registerBasesView onto a Plugin instance.
 * Returns a controllable spy so tests can change the return value per call.
 */
function wireRegisterBasesView(plugin: Plugin, returnValue: boolean): ReturnType<typeof vi.fn> {
	const spy = vi.fn(() => returnValue);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(plugin as any).registerBasesView = spy;
	return spy;
}

// ---------------------------------------------------------------------------
// isBasesAvailable
// ---------------------------------------------------------------------------

describe("isBasesAvailable", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("returns true when registerBasesView probe returns true (Bases enabled)", () => {
		wireRegisterBasesView(plugin, true);

		expect(isBasesAvailable(plugin)).toBe(true);
	});

	it("returns false when registerBasesView probe returns false (Bases disabled)", () => {
		wireRegisterBasesView(plugin, false);

		expect(isBasesAvailable(plugin)).toBe(false);
	});

	it("re-evaluates per call — reflects a change from false to true", () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyPlugin = plugin as any;
		anyPlugin.registerBasesView = vi.fn()
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);

		expect(isBasesAvailable(plugin)).toBe(false);
		expect(isBasesAvailable(plugin)).toBe(true);
	});

	it("re-evaluates per call — reflects a change from true to false", () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyPlugin = plugin as any;
		anyPlugin.registerBasesView = vi.fn()
			.mockReturnValueOnce(true)
			.mockReturnValueOnce(false);

		expect(isBasesAvailable(plugin)).toBe(true);
		expect(isBasesAvailable(plugin)).toBe(false);
	});

	it("returns false when registerBasesView is not present on plugin", () => {
		// Plugin mock does not have registerBasesView by default

		expect(isBasesAvailable(plugin)).toBe(false);
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

	it("calls registerBasesView with the story-forge-codex viewId", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		expect(spy).toHaveBeenCalledWith(
			"story-forge-codex",
			expect.objectContaining({ name: expect.any(String), factory: expect.any(Function) }),
		);
	});
});
