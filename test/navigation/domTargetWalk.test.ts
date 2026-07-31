/**
 * domTargetWalk — the DOM-touching step that feeds navigationController.ts's
 * `TargetMarkers` (ADR-28, T2.5).
 *
 * Extracted so `AnvilView` and `SidebarView` share one proximity walk instead
 * of two hand-maintained copies — two reviewers independently flagged the
 * duplication as a drift risk in exactly the place a proximity bug had just
 * been fixed. These tests cover the edge cases a reviewer would otherwise
 * have to check by hand in each host: a marker on the start element itself,
 * a marker on the root itself, a detached node, and a target outside the
 * root's subtree.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import { walkTargetMarkers, type MarkerKindOf } from "navigation/domTargetWalk";
import type { TargetKind } from "navigation/navigationController";

/** A minimal marker table: elements carrying `data-name` classify as "name",
 * `data-control` as "structuralControl". Mirrors the shape each host's real
 * `_markerKindOf` uses, without depending on either host's attribute vocabulary. */
const markerKindOf: MarkerKindOf = (el: HTMLElement): TargetKind | null => {
	if (el.hasAttribute("data-name")) return "name";
	if (el.hasAttribute("data-control")) return "structuralControl";
	return null;
};

function el(tag = "div"): HTMLElement {
	return document.createElement(tag);
}

describe("walkTargetMarkers", () => {
	it("finds a marker on the start element itself", () => {
		const root = el();
		const start = el();
		start.setAttribute("data-name", "");
		root.appendChild(start);

		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);

		expect(markers).toEqual(["name"]);
		expect(nearest).toBe(start);
	});

	it("finds a marker on the root itself when nothing between start and root carries one", () => {
		const root = el();
		root.setAttribute("data-control", "");
		const mid = el();
		const start = el();
		root.appendChild(mid);
		mid.appendChild(start);

		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);

		expect(markers).toEqual(["structuralControl"]);
		expect(nearest).toBe(root);
	});

	it("orders markers nearest-first when both the start and an ancestor carry one", () => {
		const root = el();
		const outer = el();
		outer.setAttribute("data-control", "");
		const start = el();
		start.setAttribute("data-name", "");
		root.appendChild(outer);
		outer.appendChild(start);

		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);

		// Nearest first: "name" (on start) before "structuralControl" (on outer).
		expect(markers).toEqual(["name", "structuralControl"]);
		expect(nearest).toBe(start);
	});

	it("returns an empty markers array and a null nearest when nothing in the chain carries a marker", () => {
		const root = el();
		const mid = el();
		const start = el();
		root.appendChild(mid);
		mid.appendChild(start);

		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);

		expect(markers).toEqual([]);
		expect(nearest).toBeNull();
	});

	it("stops climbing once root is reached — an ancestor beyond root is never consulted", () => {
		const grandparent = el();
		grandparent.setAttribute("data-control", ""); // outside root — must be ignored
		const root = el();
		const start = el();
		grandparent.appendChild(root);
		root.appendChild(start);
		start.setAttribute("data-name", "");

		const { markers } = walkTargetMarkers(start, root, markerKindOf);

		// Only "name" (on start) — the marker on grandparent, beyond root, never counts.
		expect(markers).toEqual(["name"]);
	});

	it("handles a detached node (no parent chain at all) without throwing", () => {
		const start = el();
		start.setAttribute("data-name", "");
		const root = el(); // never attached to start — unrelated, also detached

		expect(() => walkTargetMarkers(start, root, markerKindOf)).not.toThrow();
		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);
		expect(markers).toEqual(["name"]);
		expect(nearest).toBe(start);
	});

	it("terminates safely when the target is outside root's subtree (root is never encountered)", () => {
		// Two independent, unrelated trees — root is not an ancestor of start.
		const otherTreeRoot = el();
		const start = el();
		otherTreeRoot.appendChild(start);

		const root = el();
		const rootChild = el();
		root.appendChild(rootChild);

		expect(() => walkTargetMarkers(start, root, markerKindOf)).not.toThrow();
		const { markers, nearest } = walkTargetMarkers(start, root, markerKindOf);
		// Climbing start's real ancestor chain (up to otherTreeRoot, then null)
		// never finds root, and nothing in that unrelated chain carries a marker.
		expect(markers).toEqual([]);
		expect(nearest).toBeNull();
	});

	it("start === root with a marker on it resolves to that one marker", () => {
		const root = el();
		root.setAttribute("data-name", "");

		const { markers, nearest } = walkTargetMarkers(root, root, markerKindOf);

		expect(markers).toEqual(["name"]);
		expect(nearest).toBe(root);
	});
});
