/**
 * renderLocationsTree — read-only nested location hierarchy tree (T4.1, mockup S75).
 *
 * Renders a collapsible tree of `LocationNode[]` (from `locationTreeModel`). Each
 * node with children becomes a collapsible `section()`; leaf nodes render as plain
 * drill link rows. Flagged (unresolved/cycle) nodes are muted and non-clickable.
 * Empty input → emptyLine. Writes NOTHING.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-19
 */

import { section, emptyLine } from "../panel/components";
import type { LocationNode } from "./workspaceModel";

export interface LocationTreeDeps {
	isCollapsed: (nodeKey: string) => boolean;
}

/**
 * Render a flat list of resolved LocationNode trees into `host`.
 * Leaf nodes → a link row; parent nodes → a collapsible section with children.
 * Flagged nodes → muted, non-clickable.
 */
export function renderLocationsTree(
	host: HTMLElement,
	nodes: LocationNode[],
	deps: LocationTreeDeps = { isCollapsed: () => false },
): void {
	if (nodes.length === 0) {
		emptyLine(host, "No locations in scope.");
		return;
	}

	for (const node of nodes) {
		renderNode(host, node, deps);
	}
}

function nodeKey(node: LocationNode): string {
	return `lt:${node.file.path}`;
}

function renderNode(
	container: HTMLElement,
	node: LocationNode,
	deps: LocationTreeDeps,
): void {
	if (node.children.length > 0) {
		// Parent node: collapsible section
		const key = nodeKey(node);
		const { sectionEl, bodyEl } = section(container, node.name, {
			collapsed: deps.isCollapsed(key),
			// Badge shows direct children count only (not deep descendants).
			count: node.children.length,
		});

		// Mark the head with the node key
		const head = sectionEl.querySelector(".sf-sec-head");
		if (head instanceof HTMLElement) {
			head.setAttribute("data-sf-group-key", key);
		}

		// The label: drill link when resolved, muted when flagged
		const label = sectionEl.querySelector(".sf-sec-label");
		if (label instanceof HTMLElement) {
			if (node.flagged) {
				label.classList.add("sf-lt-node--flagged");
			} else {
				label.setAttribute("data-sf-link", node.file.path);
				label.setAttribute("role", "link");
			}
		}

		// Wrap children in an indented body list
		const list = bodyEl.createEl("div", { cls: "sf-lt-list" });
		for (const child of node.children) {
			renderNode(list, child, deps);
		}
	} else {
		// Leaf node: plain link row (or muted if flagged)
		const row = container.createEl("div", { cls: "sf-lt-row" });
		const span = row.createEl("span", {
			cls: node.flagged ? "sf-lt-node sf-lt-node--flagged" : "sf-lt-node",
			text: node.name,
		});
		if (!node.flagged) {
			span.setAttribute("data-sf-link", node.file.path);
			span.setAttribute("role", "link");
			span.setAttribute("tabindex", "0");
		}
	}
}
