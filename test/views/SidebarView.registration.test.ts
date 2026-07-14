/**
 * T3.1 — Panel registration & activation (RED tests)
 *
 * Tests:
 * - SIDEBAR_VIEW_TYPE constant is stable
 * - ICON constant is defined
 * - getViewType / getDisplayText / getIcon stable
 * - activateView creates leaf and calls reveal
 * - activateView reuses existing leaf (no duplicate)
 * - calling activateView twice → only one leaf created
 * - SidebarView extends ItemView
 * - onOpen/onClose return Promises
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, WorkspaceLeaf, ItemView } from "obsidian";
import { SIDEBAR_VIEW_TYPE, ICON } from "constants";
import { SidebarView, activateView } from "views/SidebarView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	// Override setViewState to track calls but also update view type
	leaf.setViewState = vi.fn(
		async (state: { type: string; active?: boolean }) => {
			leaf.view.getViewType = vi.fn(() => state.type);
		},
	);
	// Attach app reference for convenience in tests
	(leaf as unknown as Record<string, unknown>)["app"] = app;
	return leaf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Constants", () => {
	it("SIDEBAR_VIEW_TYPE is 'story-forge-panel'", () => {
		expect(SIDEBAR_VIEW_TYPE).toBe("story-forge-panel");
	});

	it("ICON is a non-empty string", () => {
		expect(typeof ICON).toBe("string");
		expect(ICON.length).toBeGreaterThan(0);
	});
});

describe("SidebarView: ItemView contract", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeLeaf(app);
		view = new SidebarView(leaf, app);
	});

	it("extends ItemView", () => {
		expect(view).toBeInstanceOf(ItemView);
	});

	it("getViewType() returns SIDEBAR_VIEW_TYPE", () => {
		expect(view.getViewType()).toBe(SIDEBAR_VIEW_TYPE);
	});

	it("getDisplayText() returns a non-empty string", () => {
		const text = view.getDisplayText();
		expect(typeof text).toBe("string");
		expect(text.length).toBeGreaterThan(0);
	});

	it("getIcon() returns ICON", () => {
		expect(view.getIcon()).toBe(ICON);
	});

	it("onOpen returns a Promise", async () => {
		const result = view.onOpen();
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it("onClose returns a Promise", async () => {
		await view.onOpen();
		const result = view.onClose();
		expect(result).toBeInstanceOf(Promise);
		await result;
	});
});

describe("activateView", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	it("creates a new leaf when none exist and reveals it", async () => {
		app.workspace.getLeavesOfType = vi.fn(() => []);
		const newLeaf = makeLeaf(app);
		app.workspace.getRightLeaf = vi.fn(() => newLeaf);
		app.workspace.revealLeaf = vi.fn();

		await activateView(app);

		expect(app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
		expect(newLeaf.setViewState).toHaveBeenCalledWith({
			type: SIDEBAR_VIEW_TYPE,
			active: true,
		});
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(newLeaf);
	});

	it("reuses an existing leaf instead of creating a duplicate", async () => {
		const existingLeaf = makeLeaf(app);
		app.workspace.getLeavesOfType = vi.fn(() => [existingLeaf]);
		app.workspace.getRightLeaf = vi.fn(() => makeLeaf(app));
		app.workspace.revealLeaf = vi.fn();

		await activateView(app);

		// Should NOT create a new leaf
		expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
		// Should reveal the existing leaf
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
	});

	it("calling activateView twice → only one leaf created", async () => {
		// First call: no leaf yet
		app.workspace.getLeavesOfType = vi.fn(() => []);
		const newLeaf = makeLeaf(app);
		app.workspace.getRightLeaf = vi.fn(() => newLeaf);
		app.workspace.revealLeaf = vi.fn();

		await activateView(app);

		// Second call: leaf now exists
		app.workspace.getLeavesOfType = vi.fn(() => [newLeaf]);

		await activateView(app);

		// getRightLeaf called once total (only on first call)
		expect(app.workspace.getRightLeaf).toHaveBeenCalledTimes(1);
		// revealLeaf called twice (once per activateView call)
		expect(app.workspace.revealLeaf).toHaveBeenCalledTimes(2);
	});
});
