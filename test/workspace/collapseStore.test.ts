/**
 * collapseStore.test.ts — M5 Phase 3 (RED).
 *
 * Transient collapse state keyed by (surface, scope, group) so collapsing an act in
 * Book A doesn't collapse it in Book B, and the sidebar Navigator is independent of the
 * main-area view (ADR-6).
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md (T3.1)
 */

import { describe, it, expect } from "vitest";
import { CollapseStore } from "workspace/collapseStore";

describe("CollapseStore", () => {
	it("defaults to expanded (not collapsed)", () => {
		const s = new CollapseStore();
		expect(s.isCollapsed("navigator", "book:A", "Act 1")).toBe(false);
	});

	it("toggle flips a single key", () => {
		const s = new CollapseStore();
		s.toggle("navigator", "book:A", "Act 1");
		expect(s.isCollapsed("navigator", "book:A", "Act 1")).toBe(true);
		s.toggle("navigator", "book:A", "Act 1");
		expect(s.isCollapsed("navigator", "book:A", "Act 1")).toBe(false);
	});

	it("isolates state per surface, scope, and group (ADR-6 / F8)", () => {
		const s = new CollapseStore();
		s.toggle("navigator", "book:A", "Act 1");
		expect(s.isCollapsed("navigator", "book:B", "Act 1")).toBe(false); // different scope
		expect(s.isCollapsed("main", "book:A", "Act 1")).toBe(false); // different surface
		expect(s.isCollapsed("navigator", "book:A", "Act 2")).toBe(false); // different group
		expect(s.isCollapsed("navigator", "book:A", "Act 1")).toBe(true); // unchanged
	});

	it("clear resets all state", () => {
		const s = new CollapseStore();
		s.toggle("navigator", "book:A", "Act 1");
		s.clear();
		expect(s.isCollapsed("navigator", "book:A", "Act 1")).toBe(false);
	});
});
