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
 *
 * T4.5 adds:
 *   - the three per-Card view types ("story-forge-hero"/"-table"/"-compact")
 *     register alongside "story-forge-codex" when Bases is available;
 *   - registration of all four is skipped when registerBasesView is absent
 *     (native backend renders instead, PRD/F4 AC);
 *   - the three Card registrations are skipped when the "story-forge-codex"
 *     registration itself is declined (one on/off signal, not four).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { App, Plugin, TFile, BasesEntry, BasesQueryResult, _setApiVersion, _resetApiVersion } from "../__mocks__/obsidian";
import { isBasesAvailable, registerCodexView, getBasesCapability } from "bases/BasesAdapter";
import { CodexBasesView } from "bases/CodexBasesView";
import { CardBasesView } from "bases/CardBasesView";
import * as SidebarViewModule from "views/SidebarView";
import type { LinkClickAction } from "navigation/navigationController";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Wire a spy registerBasesView onto a Plugin instance.
 * Returns the spy so tests can assert call count.
 */
function wireRegisterBasesView(plugin: Plugin, returnValue: boolean): Mock {
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
		// The codex registration (first call) decides overall availability; the
		// three Card registrations that follow are attempted too but their own
		// return values don't change what's cached (isBasesAvailable's cache = the
		// codex result).
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		// isBasesAvailable must return the cached true — not call the spy again.
		expect(isBasesAvailable(plugin)).toBe(true);
		expect(isBasesAvailable(plugin)).toBe(true);

		// Exactly the four calls registerCodexView itself makes (codex + 3 Cards);
		// isBasesAvailable adds none of its own.
		expect(spy).toHaveBeenCalledTimes(4);
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

	it("calls registerBasesView once per view type (four: codex + hero/table/compact) on the first call", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		expect(spy).toHaveBeenCalledTimes(4);
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

		// registerBasesView must be called once per view type (four) regardless of
		// how many times registerCodexView is invoked.
		expect(spy).toHaveBeenCalledTimes(4);
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

// ---------------------------------------------------------------------------
// T3.3: registerCodexView factory produces real CodexBasesView + onRowClick wiring
// ---------------------------------------------------------------------------

describe("registerCodexView T3.3 — real factory (CodexBasesView + row-click wiring)", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("factory returns a CodexBasesView instance (not throwing stub)", () => {
		let capturedFactory: ((controller: unknown, containerEl: HTMLElement) => unknown) | undefined;

		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				if (viewId === "story-forge-codex") capturedFactory = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		registerCodexView(plugin);

		expect(capturedFactory).toBeDefined();

		// Invoke the factory — must not throw and must return CodexBasesView
		const container = document.createElement("div");
		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const view = capturedFactory!(controller, container);
		expect(view).toBeInstanceOf(CodexBasesView);
	});

	it("factory's onRowClick resolves path to TFile and calls revealAndShowFile", () => {
		let capturedFactory: ((controller: unknown, containerEl: HTMLElement) => unknown) | undefined;

		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				if (viewId === "story-forge-codex") capturedFactory = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		// Spy on revealAndShowFile before registration
		const revealSpy = vi.spyOn(SidebarViewModule, "revealAndShowFile").mockResolvedValue(undefined);

		registerCodexView(plugin);
		expect(capturedFactory).toBeDefined();

		const container = document.createElement("div");
		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const view = capturedFactory!(controller, container) as CodexBasesView;
		expect(view).toBeInstanceOf(CodexBasesView);

		// Wire a file into the vault mock so path resolves to TFile
		const mockFile = new TFile();
		mockFile.path = "30 Canon/31 Characters/Lirien.md";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app.vault.getFileByPath as any).mockReturnValue(mockFile);

		// Extract the onRowClick from the view's deps via internal access
		const deps = (view as unknown as { deps: { onRowClick: (path: string) => void } }).deps;
		expect(typeof deps.onRowClick).toBe("function");

		// Invoke the row-click handler with a path
		deps.onRowClick("30 Canon/31 Characters/Lirien.md");

		// revealAndShowFile must be called with the app and the resolved TFile
		expect(revealSpy).toHaveBeenCalledWith(app, mockFile);

		revealSpy.mockRestore();
	});

	it("factory's onRowClick is a no-op when file path does not resolve", () => {
		let capturedFactory: ((controller: unknown, containerEl: HTMLElement) => unknown) | undefined;

		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				if (viewId === "story-forge-codex") capturedFactory = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		const revealSpy = vi.spyOn(SidebarViewModule, "revealAndShowFile").mockResolvedValue(undefined);

		registerCodexView(plugin);
		const container = document.createElement("div");
		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const view = capturedFactory!(controller, container) as CodexBasesView;

		// Vault returns null — path cannot be resolved
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app.vault.getFileByPath as any).mockReturnValue(null);

		const deps = (view as unknown as { deps: { onRowClick: (path: string) => void } }).deps;
		// Must not throw; revealAndShowFile must not be called
		expect(() => { deps.onRowClick("nonexistent/file.md"); }).not.toThrow();
		expect(revealSpy).not.toHaveBeenCalled();

		revealSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// T4.5 — the three per-Card view types (hero/table/compact)
// ---------------------------------------------------------------------------

/**
 * `factories[id]` is `T | undefined` under `noUncheckedIndexedAccess` (the
 * repo's strict-null baseline) — narrow with a real check + throw rather than
 * a non-null assertion or cast, so a genuinely missing registration fails with
 * a message that names which view id never registered instead of a bare
 * TypeScript-suppressed runtime crash.
 */
function requireFactory(
	factories: Record<string, (c: unknown, el: HTMLElement) => unknown>,
	id: string,
): (c: unknown, el: HTMLElement) => unknown {
	const factory = factories[id];
	if (!factory) throw new Error(`registerBasesView was never called for "${id}"`);
	return factory;
}

describe("registerCodexView T4.5 — hero/table/compact Card view registration", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("registers all three Card view types when Bases is available", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		const registeredIds = spy.mock.calls.map((call) => call[0]);
		expect(registeredIds).toEqual(
			expect.arrayContaining(["story-forge-codex", "story-forge-hero", "story-forge-table", "story-forge-compact"]),
		);
	});

	it("registers each Card view type with a name and a factory", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);

		for (const id of ["story-forge-hero", "story-forge-table", "story-forge-compact"]) {
			expect(spy).toHaveBeenCalledWith(
				id,
				expect.objectContaining({ name: expect.any(String), factory: expect.any(Function) }),
			);
		}
	});

	it("skips ALL FOUR registrations when registerBasesView is absent (native backend renders)", () => {
		// No method wired on plugin at all — registerFn is undefined.
		const result = registerCodexView(plugin);

		expect(result).toBe(false);
		// Nothing to spy on here (no registerBasesView exists) — the absence of a
		// throw plus the false return IS the assertion: no attempt was made.
	});

	it("skips the three Card registrations when the codex registration itself is declined", () => {
		const spy = wireRegisterBasesView(plugin, false);

		registerCodexView(plugin);

		// Only the one "story-forge-codex" attempt — Bases declined it, so the
		// three Card view types must not even be attempted.
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith("story-forge-codex", expect.anything());
	});

	it("each Card factory constructs a CardBasesView with the matching view id", () => {
		const factories: Record<string, (c: unknown, el: HTMLElement) => unknown> = {};
		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				factories[viewId] = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		registerCodexView(plugin);

		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		for (const id of ["story-forge-hero", "story-forge-table", "story-forge-compact"]) {
			const container = document.createElement("div");
			const view = requireFactory(factories, id)(controller, container);
			expect(view).toBeInstanceOf(CardBasesView);
			expect((view as CardBasesView).type).toBe(id);
		}
	});

	it("a Card factory's onEntryClick resolves path to TFile and calls revealAndShowFile", () => {
		const factories: Record<string, (c: unknown, el: HTMLElement) => unknown> = {};
		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				factories[viewId] = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		const revealSpy = vi.spyOn(SidebarViewModule, "revealAndShowFile").mockResolvedValue(undefined);

		registerCodexView(plugin);

		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const container = document.createElement("div");
		const view = requireFactory(factories, "story-forge-hero")(controller, container) as CardBasesView;

		const mockFile = new TFile();
		mockFile.path = "30 Canon/31 Characters/Lirien.md";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app.vault.getFileByPath as any).mockReturnValue(mockFile);

		const deps = (view as unknown as { deps: { onEntryClick: (path: string) => void } }).deps;
		deps.onEntryClick("30 Canon/31 Characters/Lirien.md");

		expect(revealSpy).toHaveBeenCalledWith(app, mockFile);

		revealSpy.mockRestore();
	});

	it("is idempotent across all four view types — no re-registration on a second call", () => {
		const spy = wireRegisterBasesView(plugin, true);

		registerCodexView(plugin);
		registerCodexView(plugin);

		expect(spy).toHaveBeenCalledTimes(4);
	});
});

// ---------------------------------------------------------------------------
// getLinkClickAction threaded through to each Card factory, read LIVE at
// click time — not captured once at registration (the coordinator's follow-up
// closing the same class of bug: a Card rendered in a standalone `.base` must
// honour the user's real configured setting exactly like AnvilView/SidebarView
// do, and must keep honouring it after the user changes Settings while the
// `.base` is still open — a captured value would go stale).
// ---------------------------------------------------------------------------

describe("registerCodexView — getLinkClickAction threaded through to Card factories (live, not captured)", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	/** Builds a minimal real BasesEntry-shaped fixture — only `file.path` matters here (no frontmatter). */
	function makeEntry(path: string): BasesEntry {
		const entry = new BasesEntry();
		const file = new TFile();
		file.path = path;
		entry.file = file;
		entry.getValue.mockImplementation(() => null);
		return entry;
	}

	it("a plain click on a rendered name honours the LIVE getLinkClickAction — 'drill' stays inert, then 'open' opens the SAME registered view after the setting changes", () => {
		const factories: Record<string, (c: unknown, el: HTMLElement) => unknown> = {};
		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				factories[viewId] = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		const revealSpy = vi.spyOn(SidebarViewModule, "revealAndShowFile").mockResolvedValue(undefined);

		// A live getter — mutated below to simulate the user changing Settings
		// while this exact registered Card view is still open, WITHOUT
		// re-registering or reconstructing anything.
		let currentAction: LinkClickAction = "drill";
		registerCodexView(plugin, () => currentAction);

		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const container = document.createElement("div");
		document.body.appendChild(container);
		const view = requireFactory(factories, "story-forge-hero")(controller, container) as CardBasesView;

		const mockFile = new TFile();
		mockFile.path = "Characters/Mara.md";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app.vault.getFileByPath as any).mockReturnValue(mockFile);

		const result = new BasesQueryResult();
		result.data = [makeEntry("Characters/Mara.md")];
		view.data = result;
		view.onDataUpdated();

		const nameEl = container.querySelector('[data-sf-link="Characters/Mara.md"]') as HTMLElement;
		expect(nameEl).not.toBeNull();

		// "drill" (default): a plain click on the name is inert — inspect, not open.
		nameEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(revealSpy).not.toHaveBeenCalled();

		// The user flips the setting in Settings while the SAME `.base` view is
		// still open — no re-registration, no new CardBasesView instance.
		currentAction = "open";

		// "open": the identical plain click on the identical name element now opens.
		nameEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(revealSpy).toHaveBeenCalledWith(app, mockFile);

		document.body.removeChild(container);
		revealSpy.mockRestore();
	});

	it("omitting getLinkClickAction defaults every Card factory to 'drill' (unchanged behaviour for existing callers)", () => {
		const factories: Record<string, (c: unknown, el: HTMLElement) => unknown> = {};
		const spy = vi.fn(
			(viewId: string, registration: { factory: (c: unknown, el: HTMLElement) => unknown }) => {
				factories[viewId] = registration.factory;
				return true;
			},
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = spy;

		const revealSpy = vi.spyOn(SidebarViewModule, "revealAndShowFile").mockResolvedValue(undefined);

		// No second argument — mirrors every pre-existing call site/test in this file.
		registerCodexView(plugin);

		const controller = { load: vi.fn(), unload: vi.fn(), register: vi.fn() };
		const container = document.createElement("div");
		document.body.appendChild(container);
		const view = requireFactory(factories, "story-forge-hero")(controller, container) as CardBasesView;

		const mockFile = new TFile();
		mockFile.path = "Characters/Mara.md";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app.vault.getFileByPath as any).mockReturnValue(mockFile);

		const result = new BasesQueryResult();
		result.data = [makeEntry("Characters/Mara.md")];
		view.data = result;
		view.onDataUpdated();

		const nameEl = container.querySelector('[data-sf-link="Characters/Mara.md"]') as HTMLElement;
		nameEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(revealSpy).not.toHaveBeenCalled();

		document.body.removeChild(container);
		revealSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// T4.5 review finding — Card registrations must be isolated from the codex
// outcome AND from one another. registerBasesView cannot be un-called: once
// "story-forge-codex" has succeeded it is genuinely live with the Bases
// runtime, so a LATER Card registration throwing (or being declined) must
// never make registerCodexView/isBasesAvailable report false — that would
// falsely disable the bases query engine plugin-wide (main.ts feeds this
// same boolean into buildEngineRegistry) over a Card-only failure.
// ---------------------------------------------------------------------------

/**
 * Wire registerBasesView so each view id can behave independently: `true`/
 * `false` return that id's registration outcome, `"throw"` makes that one
 * call throw. Every call is recorded on `spy` exactly like `wireRegisterBasesView`.
 */
function wirePerViewIdBehavior(
	plugin: Plugin,
	behaviors: Record<string, boolean | "throw">,
): Mock {
	const spy = vi.fn((viewId: string) => {
		const behavior = behaviors[viewId];
		if (behavior === "throw") throw new Error(`registerBasesView threw for "${viewId}"`);
		return behavior ?? true;
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(plugin as any).registerBasesView = spy;
	return spy;
}

describe("registerCodexView T4.5 — Card registration isolation (review finding)", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	it("REGRESSION: a later Card registration throwing does not invalidate the already-successful codex registration", () => {
		wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-table": "throw",
		});

		const result = registerCodexView(plugin);

		// The codex view genuinely registered with the Bases runtime — that
		// cannot be undone, so the reported availability must stay true.
		expect(result).toBe(true);
		expect(isBasesAvailable(plugin)).toBe(true);
	});

	it("a Card registration throwing does not stop the remaining Card registrations from being attempted", () => {
		const spy = wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-hero": "throw",
		});

		registerCodexView(plugin);

		// Despite hero throwing, table and compact must still have been attempted.
		const registeredIds = spy.mock.calls.map((call) => call[0]);
		expect(registeredIds).toEqual(
			expect.arrayContaining(["story-forge-codex", "story-forge-hero", "story-forge-table", "story-forge-compact"]),
		);
	});

	it("a Card registration declined (false) does not invalidate availability either", () => {
		wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-hero": false,
		});

		const result = registerCodexView(plugin);

		expect(result).toBe(true);
		expect(isBasesAvailable(plugin)).toBe(true);
	});

	it("logs (does not silently discard) a Card registration that throws", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-compact": "throw",
		});

		registerCodexView(plugin);

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("story-forge-compact"),
			expect.any(Error),
		);
		errorSpy.mockRestore();
	});

	it("logs (does not silently discard) a Card registration that is declined", () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-table": false,
		});

		registerCodexView(plugin);

		expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("story-forge-table"));
		debugSpy.mockRestore();
	});

	it("MUTATION-GUARD downstream: getBasesCapability still reports 'enabled' after a Card registration throws", () => {
		// This is the exact main.ts consequence the review flagged: a false
		// negative here would cascade into buildEngineRegistry.
		wirePerViewIdBehavior(plugin, {
			"story-forge-codex": true,
			"story-forge-hero": "throw",
		});

		registerCodexView(plugin);

		expect(getBasesCapability(plugin)).toBe("enabled");
	});
});

// ---------------------------------------------------------------------------
// getBasesCapability — T4.6, ADR-36's three-way signal built on isBasesAvailable
// (cached registration outcome) + apiVersion (BasesAdapter.ts is the sole
// firewall importing both, per CON-3/CON-8 — never app.plugins/internalPlugins).
// ---------------------------------------------------------------------------

describe("getBasesCapability", () => {
	let app: App;
	let plugin: Plugin;

	beforeEach(() => {
		app = new App();
		plugin = new Plugin(app);
	});

	afterEach(() => {
		_resetApiVersion();
	});

	it("reports 'enabled' when apiVersion is current and registration succeeded", () => {
		_setApiVersion("1.13.1");
		wireRegisterBasesView(plugin, true);
		registerCodexView(plugin);

		expect(getBasesCapability(plugin)).toBe("enabled");
	});

	it("reports 'disabled' when apiVersion is current but registration failed (Bases present, off)", () => {
		_setApiVersion("1.13.1");
		wireRegisterBasesView(plugin, false);
		registerCodexView(plugin);

		expect(getBasesCapability(plugin)).toBe("disabled");
	});

	it("reports 'absent' when apiVersion predates Bases, even if registerBasesView happens to be present and returns true", () => {
		// Proves the version check gates BEFORE isBasesAvailable is trusted —
		// otherwise "absent" could never be distinguished from "enabled" on an
		// old Obsidian that (hypothetically) still had the method.
		_setApiVersion("1.9.0");
		wireRegisterBasesView(plugin, true);
		registerCodexView(plugin);

		expect(getBasesCapability(plugin)).toBe("absent");
	});

	it("reports 'absent' when apiVersion predates Bases and the method is genuinely missing", () => {
		_setApiVersion("1.9.0");
		// No registerBasesView wired — registerCodexView caches false, matching
		// a real pre-1.10 Obsidian.
		registerCodexView(plugin);

		expect(getBasesCapability(plugin)).toBe("absent");
	});

	it("reads apiVersion live at call time — the mock's setter is observed without re-importing", () => {
		wireRegisterBasesView(plugin, false);
		registerCodexView(plugin);

		_setApiVersion("1.9.0");
		expect(getBasesCapability(plugin)).toBe("absent");

		_setApiVersion("1.13.1");
		expect(getBasesCapability(plugin)).toBe("disabled");
	});
});
