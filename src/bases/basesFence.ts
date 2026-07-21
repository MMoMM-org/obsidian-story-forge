/**
 * basesFence — renders a ``\`base\``` fenced code block via MarkdownRenderer.render.
 *
 * CON-3 firewall: This module is part of src/bases/ — the only sanctioned
 * home for Bases-related rendering. No other module should render a ```base```
 * fence directly.
 *
 * CON-7: Public API only — MarkdownRenderer.render is the non-deprecated
 * static method (obsidian.d.ts:4147). renderMarkdown is deprecated and
 * must not be used.
 *
 * @ref SDD/CON-3  — src/bases/ firewall
 * @ref SDD/CON-7  — public API only (MarkdownRenderer.render, not renderMarkdown)
 * @ref SDD/ADR-1  — sidepanel Bases engine uses MarkdownRenderer ```base``` fence
 */

import type { App, Component } from "obsidian";
import { MarkdownRenderer } from "obsidian";

/**
 * Render raw `.base` YAML as a ```base``` fenced code block.
 *
 * Wraps `yaml` in a ```base``` fence and delegates to the non-deprecated
 * static `MarkdownRenderer.render`. The Obsidian Bases runtime intercepts
 * the ```base``` language and renders it as a read-only Bases view.
 *
 * @param app        - the Obsidian App instance
 * @param yaml       - raw `.base` YAML source (the ViewRecord's `source`)
 * @param el         - the container element to render into
 * @param sourcePath - the path of the note providing context (ctx.activeFile.path)
 * @param component  - the Component that owns this render's lifecycle
 */
export async function renderBaseFence(
	app: App,
	yaml: string,
	el: HTMLElement,
	sourcePath: string,
	component: Component,
): Promise<void> {
	const markdown = "```base\n" + yaml + "\n```";
	await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
}
