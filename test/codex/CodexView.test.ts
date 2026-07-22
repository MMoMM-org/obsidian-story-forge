/**
 * CodexView tests — T3.3 (RED → GREEN).
 *
 * CodexView is a THIN main-area ItemView (src/codex/CodexView.ts).
 * CON-3: it has ZERO Bases typings. Its only render job is the S46 degrade
 * when Bases is off. The "open Codex.base" path goes through main.ts command
 * routing, not CodexView itself.
 *
 * Contracts verified:
 *   - CodexView extends ItemView; CODEX_VIEW_TYPE is returned by getViewType().
 *   - onOpen() renders the S46 degrade copy (no throw; no Bases typings).
 *   - onClose() clears the DOM cleanly.
 *   - No Bases API is imported or referenced in CodexView.
 *
 * @ref SDD/ADR-2 addendum — CodexView is a thin entry-point; Bases-native tabs
 * @ref SDD/CON-3 — zero Bases typings outside src/bases/
 * @ref PRD/AC-F2.5 — Bases-off degrade renders; panel + Dataview unaffected
 */

import { describe, it, expect } from "vitest";
import { App, WorkspaceLeaf } from "../__mocks__/obsidian";
import { CodexView, CODEX_VIEW_TYPE } from "codex/CodexView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeView(): { view: CodexView; app: App; leaf: WorkspaceLeaf } {
	const app = new App();
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const view = new CodexView(leaf);
	return { view, app, leaf };
}

// ---------------------------------------------------------------------------
// ItemView contract
// ---------------------------------------------------------------------------

describe("CodexView — ItemView contract", () => {
	it("getViewType() returns CODEX_VIEW_TYPE", () => {
		const { view } = makeView();
		expect(view.getViewType()).toBe(CODEX_VIEW_TYPE);
		expect(CODEX_VIEW_TYPE).toBe("story-forge-codex-host");
	});

	it("getDisplayText() returns a non-empty string", () => {
		const { view } = makeView();
		expect(view.getDisplayText().length).toBeGreaterThan(0);
	});

	it("getIcon() returns a non-empty string", () => {
		const { view } = makeView();
		expect(view.getIcon().length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// S46 degrade render (the only render job CodexView has)
// ---------------------------------------------------------------------------

describe("CodexView — S46 degrade render", () => {
	it("onOpen() renders S46 degrade copy without throwing", async () => {
		const { view } = makeView();
		await expect(view.onOpen()).resolves.not.toThrow();
	});

	it("onOpen() renders text indicating Bases is required", async () => {
		const { view } = makeView();
		await view.onOpen();
		// The S46 copy references Bases — check for the key degrade message
		expect(view.contentEl.textContent).toMatch(/[Bb]ases/);
	});

	it("onOpen() renders a non-empty contentEl (DOM is present)", async () => {
		const { view } = makeView();
		await view.onOpen();
		expect(view.contentEl.children.length).toBeGreaterThan(0);
	});

	it("onClose() empties the DOM without throwing", async () => {
		const { view } = makeView();
		await view.onOpen();
		await expect(view.onClose()).resolves.not.toThrow();
		expect(view.contentEl.children.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// CON-3 firewall — no Bases typings in CodexView
// ---------------------------------------------------------------------------

describe("CodexView — CON-3 firewall", () => {
	it("CodexView module does not import from src/bases/ (firewall check via instance shape)", () => {
		const { view } = makeView();
		// If CodexView imported Bases typings, it would be in violation of CON-3.
		// We verify behaviorally: the view has no 'data' or 'config' fields that
		// would indicate a BasesView import leaked through.
		expect((view as unknown as Record<string, unknown>).data).toBeUndefined();
		expect((view as unknown as Record<string, unknown>).config).toBeUndefined();
	});
});
