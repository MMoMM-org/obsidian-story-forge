/**
 * navigationController — the target-kind matrix (PRD F2, ADR-28).
 *
 * Behaviour must depend only on *what kind of target* was clicked, never on
 * which surface (Anvil vs Workbench) or which tab hosts it. These tests
 * exercise the pure classifier and the pure outcome resolver directly —
 * no Obsidian runtime, no DOM traversal. `TargetMarkers` is the nearest-
 * first-ordered list of kinds a host found walking up from the event
 * target; surfaces (T2.5) are responsible for producing that order from
 * their own markup via `closest()`, which is out of scope here — but
 * several tests below assert against the *real* markup shape
 * (`src/workspace/renderTimeline.ts`, `src/panel/components.ts`) to pin
 * down what "nearest first" must mean for the one case that nests a name
 * inside a structural control.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import {
	classifyTarget,
	createNavigationController,
	resolveNavigationOutcome,
	type LinkClickAction,
} from "navigation/navigationController";

describe("classifyTarget", () => {
	it("classifies a name/link target", () => {
		expect(classifyTarget(["name"])).toBe("name");
	});

	it("classifies a card/row body target", () => {
		expect(classifyTarget(["cardBody"])).toBe("cardBody");
	});

	it("classifies a structural control target", () => {
		expect(classifyTarget(["structuralControl"])).toBe("structuralControl");
	});

	it("classifies an editable field target", () => {
		expect(classifyTarget(["editableField"])).toBe("editableField");
	});

	it("classifies no markers as unknown", () => {
		expect(classifyTarget([])).toBe("unknown");
	});

	it("prefers the name over its surrounding card body when the name is nearer [PRD/F2 AC]", () => {
		// Nearest-first: the name was found before the card body while walking
		// up from the event target, so it is closer and wins.
		expect(classifyTarget(["name", "cardBody"])).toBe("name");
	});

	it(
		"resolves a name nested inside a structural control to the name, when the name is nearer " +
			"— reproduces the timeline act label's real markup",
		() => {
			// src/workspace/renderTimeline.ts:131-141 gives the act label
			// (`.sf-sec-label`, the nearer element) `data-sf-link`, while
			// src/panel/components.ts's `section()` gives its parent
			// `.sf-sec-head` `data-sf-section-toggle`. Clicking the label finds
			// the name first while walking up the ancestor chain, then the
			// structural control — exactly this ordering — and must drill to the
			// beat note, per AnvilView._onClick's own stated intent
			// ("a nearest data-sf-link wins over a surrounding section header").
			expect(classifyTarget(["name", "structuralControl"])).toBe("name");
		},
	);

	it(
		"resolves the structural control's own chrome to the control, when no name is nested inside it " +
			"— reproduces clicking the section header's chevron",
		() => {
			// Clicking the chevron itself (not the act label) never finds
			// data-sf-link while walking up — only data-sf-section-toggle — so
			// the ancestor chain contains no "name" marker at all here.
			expect(classifyTarget(["structuralControl"])).toBe("structuralControl");
		},
	);
});

describe("resolveNavigationOutcome — the matrix", () => {
	const cases: Array<{
		label: string;
		kind: ReturnType<typeof classifyTarget>;
		modifier: boolean;
		linkClickAction: LinkClickAction;
		expected: string;
	}> = [
		// Entity name / link — honours the configured action; modifier inverts it.
		{
			label: "name, plain click, configured=drill (default) → inspect",
			kind: "name",
			modifier: false,
			linkClickAction: "drill",
			expected: "inspect",
		},
		{
			label: "name, modifier click, configured=drill → the other action, openNote",
			kind: "name",
			modifier: true,
			linkClickAction: "drill",
			expected: "openNote",
		},
		{
			label: "name, plain click, configured=open → openNote",
			kind: "name",
			modifier: false,
			linkClickAction: "open",
			expected: "openNote",
		},
		{
			label: "name, modifier click, configured=open → the other action, inspect",
			kind: "name",
			modifier: true,
			linkClickAction: "open",
			expected: "inspect",
		},
		// Card / row body — always inspect on plain click, openNote on modifier,
		// regardless of the configured action (only the name honours the setting).
		{
			label: "cardBody, plain click, configured=drill → inspect",
			kind: "cardBody",
			modifier: false,
			linkClickAction: "drill",
			expected: "inspect",
		},
		{
			label: "cardBody, plain click, configured=open → still inspect",
			kind: "cardBody",
			modifier: false,
			linkClickAction: "open",
			expected: "inspect",
		},
		{
			label: "cardBody, modifier click, configured=drill → openNote",
			kind: "cardBody",
			modifier: true,
			linkClickAction: "drill",
			expected: "openNote",
		},
		{
			label: "cardBody, modifier click, configured=open → still openNote",
			kind: "cardBody",
			modifier: true,
			linkClickAction: "open",
			expected: "openNote",
		},
		// Structural control — operate the control only; modifier never navigates.
		{
			label: "structuralControl, plain click → operateControl",
			kind: "structuralControl",
			modifier: false,
			linkClickAction: "drill",
			expected: "operateControl",
		},
		{
			label: "structuralControl, modifier click → still operateControl, never navigates",
			kind: "structuralControl",
			modifier: true,
			linkClickAction: "open",
			expected: "operateControl",
		},
		// Editable field — focus for editing; modifier makes no difference.
		{
			label: "editableField, plain click → focusField",
			kind: "editableField",
			modifier: false,
			linkClickAction: "drill",
			expected: "focusField",
		},
		{
			label: "editableField, modifier click → still focusField",
			kind: "editableField",
			modifier: true,
			linkClickAction: "open",
			expected: "focusField",
		},
		// Unknown target — no known kind, no action.
		{
			label: "unknown, plain click → none",
			kind: "unknown",
			modifier: false,
			linkClickAction: "drill",
			expected: "none",
		},
		{
			label: "unknown, modifier click → still none",
			kind: "unknown",
			modifier: true,
			linkClickAction: "open",
			expected: "none",
		},
	];

	for (const { label, kind, modifier, linkClickAction, expected } of cases) {
		it(label, () => {
			expect(resolveNavigationOutcome(kind, modifier, linkClickAction).action).toBe(expected);
		});
	}

	it("never resolves an unknown target to an action, across every modifier/setting combination", () => {
		// Structural guarantee behind the "no known target kind ⇒ no action, no
		// write" AC: sweep every input the resolver accepts for kind="unknown".
		for (const modifier of [false, true]) {
			for (const linkClickAction of ["drill", "open"] as const) {
				expect(resolveNavigationOutcome("unknown", modifier, linkClickAction)).toEqual({
					action: "none",
				});
			}
		}
	});
});

describe("createNavigationController", () => {
	it("invokes the host's inspect callback when the outcome resolves to inspect", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle(["name"], false);

		expect(outcome.action).toBe("inspect");
		expect(inspect).toHaveBeenCalledTimes(1);
	});

	it("does not invoke inspect when the outcome is openNote", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle(["name"], true);

		expect(outcome.action).toBe("openNote");
		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not invoke inspect when the outcome is operateControl", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		controller.handle(["structuralControl"], false);

		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not invoke inspect when the target is a name nested inside a structural control but the control is nearer", () => {
		// The mirror image of the timeline act-label case: if a host ever walks
		// up and finds the control before any name (e.g. clicking chrome that
		// sits between the two), the control must still win and inspect must
		// not fire.
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle(["structuralControl", "name"], false);

		expect(outcome.action).toBe("operateControl");
		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not invoke inspect when the outcome is focusField", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		controller.handle(["editableField"], false);

		expect(inspect).not.toHaveBeenCalled();
	});

	it("resolves an unknown target to no action and never invokes inspect — no navigation, no write", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle([], false);

		expect(outcome.action).toBe("none");
		expect(inspect).not.toHaveBeenCalled();
	});

	it("reads the configured action live — a setting change takes effect without reconstruction [PRD/F2 AC]", () => {
		let configured: LinkClickAction = "drill";
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => configured,
			inspect,
		});

		const before = controller.handle(["name"], false);
		expect(before.action).toBe("inspect");

		// Simulate the user changing the setting in-place — no new controller,
		// no reload. The very next click on the same controller instance must
		// already reflect the new value.
		configured = "open";
		const after = controller.handle(["name"], false);
		expect(after.action).toBe("openNote");
	});
});
