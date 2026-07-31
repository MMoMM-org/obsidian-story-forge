/**
 * navigationController — the target-kind matrix, one rule for both surfaces.
 *
 * PRD F2: a click's behaviour is determined by *what kind of target* it is,
 * never by which tab or panel hosts it. Today `AnvilView` and `SidebarView`
 * each hand-roll this rule and disagree (see the divergence note below) —
 * this module is the single source of truth both are wired to in T2.5.
 *
 * ADR-28: classify-then-act. Surfaces contribute *target markers* — did the
 * click land on a name, a card body, a structural control, an editable
 * field — never behaviour. This module classifies and decides; a host
 * supplies an `inspect` callback for the one action whose *meaning* varies
 * per surface (the Anvil shows it in the editor pane; the Workbench shows it
 * and suspends follow-the-active-note). Every other action (open note,
 * operate a control, focus a field) is returned as a plain decision because
 * enacting it needs surface-specific identity (which file, which control,
 * which input) that this module intentionally never sees — it stays pure,
 * with no Obsidian runtime import.
 *
 * Divergence this module resolves (read during T2.4, not touched here):
 *   - `AnvilView._onClick` checks `data-sf-link` (name) *before*
 *     `data-sf-section-toggle` (structural) for most of the handler, but its
 *     own layout/timeline-mode structural controls are checked *before* the
 *     link. So even within one surface the priority is inconsistent.
 *   - `SidebarView._onClick` checks `data-sf-section-toggle` and its nav
 *     controls (Back/open) *before* `data-sf-link` — the opposite order.
 *   A structural control must never lose to a name it happens to contain
 *   (see `classifyTarget`), which is the rule both existing handlers were
 *   groping toward without stating it.
 *
 * Naming note: the persisted setting's stored values remain `"drill"` |
 * `"open"` (storage is outside this task) — "inspect" is the shared term the
 * PRD uses for the behaviour; the mapping happens inside this module only.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

/** The kinds of thing a click can land on, per the PRD F2 matrix. */
export type TargetKind = "name" | "cardBody" | "structuralControl" | "editableField";

/**
 * What a surface observed about the clicked element, expressed as plain
 * booleans rather than a DOM node — keeps this module free of any DOM or
 * Obsidian dependency. A host derives these from its own markup (e.g.
 * `closest("[data-sf-link]")`) before calling `classifyTarget`/`handle`.
 */
export interface TargetMarkers {
	/** The click landed on (or inside) an entity name / wikilink. */
	readonly isName?: boolean;
	/** The click landed on a card or row body that is not the name itself. */
	readonly isCardBody?: boolean;
	/** The click landed on a chevron, collapse header, tab, pill or dropdown. */
	readonly isStructuralControl?: boolean;
	/** The click landed on an editable control in the editor pane. */
	readonly isEditableField?: boolean;
}

/** The persisted setting's stored values (unchanged by this task). */
export type LinkClickAction = "drill" | "open";

/** The decision the matrix resolves to for a given target and click. */
export type NavigationAction = "inspect" | "openNote" | "operateControl" | "focusField" | "none";

/** The result of resolving a click: an action, and nothing else. */
export interface NavigationOutcome {
	readonly action: NavigationAction;
}

const NONE_OUTCOME: NavigationOutcome = { action: "none" };

/**
 * Classify a click by target kind, most-specific first.
 *
 * A structural control wins over everything — operating it must never be
 * mistaken for navigation, even if a host's markup nests a name-ish label
 * inside it (mirrors "a bare click must not mutate": here, must not
 * navigate). Otherwise the name wins over its surrounding card body
 * [PRD/F2 AC]. No marker set at all classifies as `"unknown"`.
 */
export function classifyTarget(markers: TargetMarkers): TargetKind | "unknown" {
	if (markers.isStructuralControl) return "structuralControl";
	if (markers.isEditableField) return "editableField";
	if (markers.isName) return "name";
	if (markers.isCardBody) return "cardBody";
	return "unknown";
}

/** Resolves a name/link click: honours the configured action; modifier inverts it. */
function resolveNameOutcome(modifier: boolean, linkClickAction: LinkClickAction): NavigationOutcome {
	const defaultIsInspect = linkClickAction === "drill";
	const isInspect = modifier ? !defaultIsInspect : defaultIsInspect;
	return { action: isInspect ? "inspect" : "openNote" };
}

/**
 * Resolves a card/row body click: always inspect on a plain click, always
 * open on a modifier click — the configured action only governs the name,
 * never the surrounding body.
 */
function resolveCardBodyOutcome(modifier: boolean): NavigationOutcome {
	return { action: modifier ? "openNote" : "inspect" };
}

/**
 * Resolve the action for a classified target.
 *
 * `kind` is exhaustively switched over so an `"unknown"` target has no
 * syntactic path to any action but `"none"` — the "no known target kind ⇒
 * no action, no write" AC is structural here, not merely tested.
 */
export function resolveNavigationOutcome(
	kind: TargetKind | "unknown",
	modifier: boolean,
	linkClickAction: LinkClickAction,
): NavigationOutcome {
	switch (kind) {
		case "name":
			return resolveNameOutcome(modifier, linkClickAction);
		case "cardBody":
			return resolveCardBodyOutcome(modifier);
		case "structuralControl":
			// Operate the control only — a modifier never turns this into navigation.
			return { action: "operateControl" };
		case "editableField":
			// Focus for editing — same regardless of modifier.
			return { action: "focusField" };
		case "unknown":
			return NONE_OUTCOME;
	}
}

/** Dependencies a host supplies to a `NavigationController`. */
export interface NavigationControllerDeps {
	/** Reads the live configured action; called per click so a settings change needs no reload. */
	readonly getLinkClickAction: () => LinkClickAction;
	/**
	 * Shows the target in place, per this host's own meaning of "inspect".
	 * Invoked exactly when the resolved action is `"inspect"`.
	 */
	readonly inspect: () => void;
}

/** The shared click-routing surface a host wires its DOM handler to. */
export interface NavigationController {
	/** Classify `markers`, resolve the action, and invoke `inspect` if that is the result. */
	handle(markers: TargetMarkers, modifier: boolean): NavigationOutcome;
}

/**
 * Build a `NavigationController` for one host.
 *
 * The controller classifies and decides; everything surface-specific is
 * either the `inspect` callback or left to the host via the returned
 * outcome (open the resolved file, operate the specific control that was
 * clicked, focus the specific input) — this module never touches the DOM
 * or the Obsidian API.
 */
export function createNavigationController(deps: NavigationControllerDeps): NavigationController {
	return {
		handle(markers, modifier) {
			const kind = classifyTarget(markers);
			const outcome = resolveNavigationOutcome(kind, modifier, deps.getLinkClickAction());
			if (outcome.action === "inspect") deps.inspect();
			return outcome;
		},
	};
}
