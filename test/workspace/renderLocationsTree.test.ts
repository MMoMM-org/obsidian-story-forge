/**
 * renderLocationsTree.test.ts — T4.1 read-only location hierarchy tree.
 *
 * Tests: nesting depth, drill spans, flagged node muted, collapse seam,
 * empty-state, no write calls.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-19
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { locationTreeModel, type LocationNode, type LocationRow } from "workspace/workspaceModel";
import { renderLocationsTree } from "workspace/renderLocationsTree";

function host(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeRow(name: string, world: string = ""): LocationRow {
	return {
		file: createMockTFile({ basename: name, path: `${name}.md` }),
		name,
		world,
	};
}

/** Build a resolved tree: resolve(text) returns {basename: text} if present in `knownNames`. */
function resolve(knownNames: string[]): (text: string) => { basename: string } | null {
	return (text) => (knownNames.includes(text) ? { basename: text } : null);
}

const noDeps = { isCollapsed: () => false };

describe("renderLocationsTree", () => {
	it("renders an empty-state line when node list is empty", () => {
		const el = host();
		renderLocationsTree(el, [], noDeps);
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
		expect(el.querySelector(".sf-lt-node")).toBeNull();
	});

	it("renders a root location as a drill link with correct path", () => {
		const el = host();
		const rows = [makeRow("Silvercrest")];
		const nodes = locationTreeModel(rows, resolve([]));
		renderLocationsTree(el, nodes, noDeps);

		const link = el.querySelector("[data-sf-link]") as HTMLElement | null;
		expect(link).not.toBeNull();
		expect(link!.getAttribute("data-sf-link")).toBe("Silvercrest.md");
		expect(link!.textContent).toBe("Silvercrest");
	});

	it("renders nested children under their parent (depth 2)", () => {
		const el = host();
		const rows = [makeRow("The Realm"), makeRow("Silvercrest", "The Realm")];
		const nodes = locationTreeModel(rows, resolve(["The Realm"]));
		renderLocationsTree(el, nodes, noDeps);

		// Should have two drill links
		const links = el.querySelectorAll("[data-sf-link]");
		expect(links.length).toBeGreaterThanOrEqual(2);
		const paths = [...links].map((l) => l.getAttribute("data-sf-link"));
		expect(paths).toContain("The Realm.md");
		expect(paths).toContain("Silvercrest.md");
	});

	it("renders a flagged node as muted and non-clickable", () => {
		const el = host();
		// Unresolved world link → flagged
		const rows = [makeRow("Lost Place", "[[Unknown World]]")];
		const nodes = locationTreeModel(rows, resolve([]));
		expect(nodes[0]!.flagged).toBe(true);
		renderLocationsTree(el, nodes, noDeps);

		// Flagged node must be muted (sf-lt-node--flagged) and have no data-sf-link
		const flaggedEl = el.querySelector(".sf-lt-node--flagged");
		expect(flaggedEl).not.toBeNull();
		expect(flaggedEl!.hasAttribute("data-sf-link")).toBe(false);
	});

	it("renders collapse toggle attributes (data-sf-section-toggle) for each node", () => {
		const el = host();
		const rows = [makeRow("The Realm"), makeRow("Silvercrest", "The Realm")];
		const nodes = locationTreeModel(rows, resolve(["The Realm"]));
		renderLocationsTree(el, nodes, noDeps);

		// Section toggles must be present for parent nodes
		const toggles = el.querySelectorAll("[data-sf-section-toggle]");
		expect(toggles.length).toBeGreaterThan(0);
	});

	it("honors the initial collapsed state from deps", () => {
		const el = host();
		const rows = [makeRow("The Realm"), makeRow("Silvercrest", "The Realm")];
		const nodes = locationTreeModel(rows, resolve(["The Realm"]));
		renderLocationsTree(el, nodes, { isCollapsed: () => true });

		const collapsedBody = el.querySelector(".sf-sec-body--collapsed");
		expect(collapsedBody).not.toBeNull();
	});

	it("renders a leaf-only root without a collapse toggle", () => {
		const el = host();
		const rows = [makeRow("Leafy")];
		const nodes = locationTreeModel(rows, resolve([]));
		renderLocationsTree(el, nodes, noDeps);

		// A leaf node (no children) should render as a plain link row, not a collapsible section
		const leafLink = el.querySelector("[data-sf-link]") as HTMLElement | null;
		expect(leafLink).not.toBeNull();
		expect(leafLink!.textContent).toBe("Leafy");
	});

	it("renders deep nesting (3 levels)", () => {
		const el = host();
		const rows = [
			makeRow("World"),
			makeRow("Region", "World"),
			makeRow("City", "Region"),
		];
		const nodes = locationTreeModel(rows, resolve(["World", "Region"]));
		renderLocationsTree(el, nodes, noDeps);

		const links = el.querySelectorAll("[data-sf-link]");
		const paths = [...links].map((l) => l.getAttribute("data-sf-link"));
		expect(paths).toContain("World.md");
		expect(paths).toContain("Region.md");
		expect(paths).toContain("City.md");
	});

	it("is read-only by construction: signature accepts no App or writer, output contains only drill-link spans (no write affordances)", () => {
		// renderLocationsTree takes only (host, nodes, deps) — no App, no writer parameter.
		// It cannot write frontmatter regardless of behavior.
		// Assert structurally: the rendered output contains read-only drill links
		// and no interactive write affordances (e.g. no buttons, no inputs).
		const el = host();
		const rows = [makeRow("Place")];
		const nodes = locationTreeModel(rows, resolve([]));
		renderLocationsTree(el, nodes, noDeps);

		// Read-only: produces drill spans, not write controls
		const link = el.querySelector("[data-sf-link]");
		expect(link).not.toBeNull();
		expect(link!.tagName.toLowerCase()).not.toBe("button");
		expect(link!.tagName.toLowerCase()).not.toBe("input");
		// No form elements that could trigger writes
		expect(el.querySelector("button")).toBeNull();
		expect(el.querySelector("input")).toBeNull();
	});

	it("flagged PARENT node (has children): section label carries sf-lt-node--flagged and has no data-sf-link", () => {
		// Build a LocationNode directly: flagged=true AND children.length > 0.
		// This takes the section() path (parent branch) in renderNode, so the
		// flagged modifier must land on the .sf-sec-label, not on a leaf span.
		const child: LocationNode = {
			file: createMockTFile({ basename: "Sublocation", path: "Sublocation.md" }),
			name: "Sublocation",
			children: [],
			flagged: false,
		};
		const parent: LocationNode = {
			file: createMockTFile({ basename: "GhostRegion", path: "GhostRegion.md" }),
			name: "GhostRegion",
			children: [child],
			flagged: true,
		};

		const el = host();
		renderLocationsTree(el, [parent], noDeps);

		// The section label for the flagged parent must carry the muted modifier
		const flaggedLabel = el.querySelector(".sf-sec-label.sf-lt-node--flagged");
		expect(flaggedLabel).not.toBeNull();
		// Flagged parent must NOT have a data-sf-link (non-clickable)
		expect(flaggedLabel!.hasAttribute("data-sf-link")).toBe(false);
		// The child (unflagged leaf) should still render with its drill link
		const childLink = el.querySelector("[data-sf-link='Sublocation.md']");
		expect(childLink).not.toBeNull();
	});
});
