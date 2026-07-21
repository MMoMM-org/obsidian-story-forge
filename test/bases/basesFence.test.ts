/**
 * basesFence tests — T1.1 (RED first).
 *
 * Tests:
 *  - renderBaseFence wraps YAML as a ```base``` fenced code block
 *  - renderBaseFence calls MarkdownRenderer.render with the fenced content
 *  - renderBaseFence passes app, el, sourcePath, and component through correctly
 *  - renderBaseFence awaits the MarkdownRenderer.render result
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, Component } from "../__mocks__/obsidian";
import { renderBaseFence } from "bases/basesFence";
import { MarkdownRenderer } from "obsidian";

// ---------------------------------------------------------------------------
// MarkdownRenderer is exported by __mocks__/obsidian.ts with a shared static
// vi.fn() spy.  We override it here with a fresh vi.fn() per module load so
// this file's assertions are isolated from any other test file's spy state.
// ---------------------------------------------------------------------------

vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	return {
		...actual,
		MarkdownRenderer: {
			render: vi.fn(async () => {}),
		},
	};
});

// ---------------------------------------------------------------------------
// renderBaseFence
// ---------------------------------------------------------------------------

describe("renderBaseFence", () => {
	let app: App;
	let el: HTMLElement;
	let component: Component;

	beforeEach(() => {
		app = new App();
		el = document.createElement("div");
		component = new Component();
		vi.mocked(MarkdownRenderer.render).mockClear();
	});

	it("calls MarkdownRenderer.render with a ```base``` fenced block", async () => {
		const yaml = "filters: {}\nviews: []";
		const sourcePath = "Characters/Aria.md";

		await renderBaseFence(app, yaml, el, sourcePath, component);

		expect(MarkdownRenderer.render).toHaveBeenCalledOnce();

		const [, markdown] = vi.mocked(MarkdownRenderer.render).mock.calls[0]!;
		expect(markdown).toBe("```base\n" + yaml + "\n```");
	});

	it("passes app, el, sourcePath, and component to MarkdownRenderer.render", async () => {
		const yaml = "filters: {}";
		const sourcePath = "Scenes/Act1.md";

		await renderBaseFence(app, yaml, el, sourcePath, component);

		expect(MarkdownRenderer.render).toHaveBeenCalledWith(
			app,
			expect.any(String),
			el,
			sourcePath,
			component,
		);
	});

	it("returns a Promise that resolves when MarkdownRenderer.render resolves", async () => {
		const yaml = "views: []";
		const sourcePath = "test.md";

		// Verify it does not throw and the promise settles
		await expect(renderBaseFence(app, yaml, el, sourcePath, component)).resolves.toBeUndefined();
	});

	it("propagates rejection when MarkdownRenderer.render rejects", async () => {
		const yaml = "views: []";
		const sourcePath = "test.md";
		vi.mocked(MarkdownRenderer.render).mockRejectedValueOnce(new Error("render failed"));

		await expect(renderBaseFence(app, yaml, el, sourcePath, component)).rejects.toThrow("render failed");
	});
});
