/**
 * navigationController — the target-kind matrix (PRD F2, ADR-28).
 *
 * Behaviour must depend only on *what kind of target* was clicked, never on
 * which surface (Anvil vs Workbench) or which tab hosts it. These tests
 * exercise the pure classifier and the pure outcome resolver directly —
 * no Obsidian runtime, no DOM traversal. Surfaces (T2.5) are responsible for
 * turning their own markup into `TargetMarkers`; that mapping is out of
 * scope here.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import {
	classifyTarget,
	createNavigationController,
	resolveNavigationOutcome,
	type LinkClickAction,
	type TargetMarkers,
} from "navigation/navigationController";

/** All markers false — the "nothing matched" baseline, overridden per test. */
const getMockMarkers = (overrides?: Partial<TargetMarkers>): TargetMarkers => ({
	isName: false,
	isCardBody: false,
	isStructuralControl: false,
	isEditableField: false,
	...overrides,
});

describe("classifyTarget", () => {
	it("classifies a name/link target", () => {
		expect(classifyTarget(getMockMarkers({ isName: true }))).toBe("name");
	});

	it("classifies a card/row body target", () => {
		expect(classifyTarget(getMockMarkers({ isCardBody: true }))).toBe("cardBody");
	});

	it("classifies a structural control target", () => {
		expect(classifyTarget(getMockMarkers({ isStructuralControl: true }))).toBe(
			"structuralControl",
		);
	});

	it("classifies an editable field target", () => {
		expect(classifyTarget(getMockMarkers({ isEditableField: true }))).toBe("editableField");
	});

	it("classifies no markers as unknown", () => {
		expect(classifyTarget(getMockMarkers())).toBe("unknown");
	});

	it("prefers the name over its surrounding card body [PRD/F2 AC]", () => {
		const markers = getMockMarkers({ isName: true, isCardBody: true });
		expect(classifyTarget(markers)).toBe("name");
	});

	it("prefers a structural control over a name and card body it happens to contain", () => {
		// A chevron/tab/pill is a self-contained control; even if a host's markup
		// nests a name-ish label inside it, operating the control must win —
		// a bare click must never turn into navigation. This is the general form
		// of "clicks must not mutate" for click *routing*, not just writes.
		const markers = getMockMarkers({
			isStructuralControl: true,
			isName: true,
			isCardBody: true,
		});
		expect(classifyTarget(markers)).toBe("structuralControl");
	});
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

		const outcome = controller.handle(getMockMarkers({ isName: true }), false);

		expect(outcome.action).toBe("inspect");
		expect(inspect).toHaveBeenCalledTimes(1);
	});

	it("does not invoke inspect when the outcome is openNote", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle(getMockMarkers({ isName: true }), true);

		expect(outcome.action).toBe("openNote");
		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not invoke inspect when the outcome is operateControl", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		controller.handle(getMockMarkers({ isStructuralControl: true }), false);

		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not invoke inspect when the outcome is focusField", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		controller.handle(getMockMarkers({ isEditableField: true }), false);

		expect(inspect).not.toHaveBeenCalled();
	});

	it("resolves an unknown target to no action and never invokes inspect — no navigation, no write", () => {
		const inspect = vi.fn();
		const controller = createNavigationController({
			getLinkClickAction: () => "drill",
			inspect,
		});

		const outcome = controller.handle(getMockMarkers(), false);

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

		const before = controller.handle(getMockMarkers({ isName: true }), false);
		expect(before.action).toBe("inspect");

		// Simulate the user changing the setting in-place — no new controller,
		// no reload. The very next click on the same controller instance must
		// already reflect the new value.
		configured = "open";
		const after = controller.handle(getMockMarkers({ isName: true }), false);
		expect(after.action).toBe("openNote");
	});
});
