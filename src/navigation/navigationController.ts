/**
 * navigationController — the target-kind matrix, one rule for both surfaces.
 *
 * PRD F2: a click's behaviour is determined by *what kind of target* it is,
 * never by which tab or panel hosts it. Today `AnvilView` and `SidebarView`
 * each hand-roll this rule with a different *check order*, which is the
 * divergence this module resolves — see below for what is actually
 * inconsistent between them versus what both already agree on.
 *
 * ADR-28: classify-then-act. Surfaces contribute *target markers* — never
 * behaviour. This module classifies and decides; a host supplies an
 * `inspect` callback for the one action whose *meaning* varies per surface
 * (the Anvil shows it in the editor pane; the Workbench shows it and
 * suspends follow-the-active-note). Every other action (open note, operate a
 * control, focus a field) is returned as a plain decision because enacting
 * it needs surface-specific identity (which file, which control, which
 * input) that this module intentionally never sees — it stays pure, with no
 * Obsidian runtime import.
 *
 * **Precedence is proximity, not a fixed kind ranking.** A name can be
 * nested *inside* a structural control on purpose — e.g.
 * `src/workspace/renderTimeline.ts` gives a timeline act's `.sf-sec-label`
 * (child) a `data-sf-link` while `src/panel/components.ts`'s `section()`
 * gives the `.sf-sec-head` (parent) `data-sf-section-toggle`. Clicking the
 * act label must drill to its beat note; clicking the chevron next to it
 * must collapse the section. `AnvilView._onClick` (l.432-433) states this
 * outright: *"a nearest `data-sf-link` wins over a surrounding section
 * header, so an act label / dot / card field drills while the chevron
 * collapses."* That is not a bug — a host that reports markers **nearest
 * event target first** (e.g. by walking up from the click with `closest()`
 * calls in that order) reproduces it for free, and derives the PRD's one
 * explicit precedence AC (name over card body) the same way, instead of it
 * being a hardcoded special case.
 *
 * What genuinely differs between the two surfaces — and is *not* proximity
 * — is check *order* for markers that never nest: `SidebarView._onClick`
 * checks its section headers and nav controls (Back/open) before it checks
 * `data-sf-link` at all, while `AnvilView._onClick` checks its layout/
 * timeline-submode tab controls before the link. Neither of those
 * structural controls ever contains a name (confirmed against
 * `src/anvil/anvilTabs.ts` — the tab buttons carry no nested link), so this
 * was never a proximity conflict, just two surfaces disagreeing on an
 * arbitrary global order. `TargetMarkers` being nearest-first-ordered per
 * click, rather than a fixed priority table, removes the arbitrariness:
 * whichever kind is actually closest to the event wins, every time.
 *
 * Naming note: the persisted setting's stored values remain `"drill"` |
 * `"open"` (storage is outside this task) — "inspect" is the shared term the
 * PRD uses for the behaviour; the mapping happens inside this module only.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

/**
 * The kinds of thing a click can land on, per the PRD F2 matrix.
 *
 * `cardTitle` is a Codex Card's title: it is also a link (`data-sf-link`), but
 * only the hosts that have an editor pane list its marker, so everywhere else
 * it classifies as a plain `name`. Its behaviour follows `cardTitleOpensNote`,
 * not `linkClickAction`, which keeps governing relation pills and chips.
 */
export type TargetKind = "name" | "cardTitle" | "cardBody" | "structuralControl" | "editableField";

/**
 * The target kinds a surface found along the DOM ancestor chain of a click,
 * from the event target upward, **nearest first**. A host builds this by
 * walking up from the event target (as `closest()` calls already do) and
 * recording each marker kind it recognises as it climbs — the same order the
 * two existing handlers implicitly rely on for the nested name-in-a-
 * structural-control case. An empty array means none of the four marker
 * kinds matched anything in the ancestor chain.
 *
 * Kept as a plain array of kinds — not a DOM node — so this module stays
 * free of any DOM or Obsidian dependency.
 */
export type TargetMarkers = readonly TargetKind[];

/** The persisted setting's stored values (unchanged by this task). */
export type LinkClickAction = "drill" | "open";

/** The decision the matrix resolves to for a given target and click. */
export type NavigationAction = "inspect" | "openNote" | "openNoteInTab" | "operateControl" | "focusField" | "none";

/** The result of resolving a click: an action, and nothing else. */
export interface NavigationOutcome {
	readonly action: NavigationAction;
}

const NONE_OUTCOME: NavigationOutcome = { action: "none" };

/**
 * Classify a click by target kind: whichever kind is nearest the event
 * target wins — `markers[0]`. This is how a name nested inside a structural
 * control (the timeline act label inside its collapsible section header)
 * resolves to `"name"` while the control's own chrome (the chevron) resolves
 * to `"structuralControl"`, and it is how the name wins over its
 * surrounding card body [PRD/F2 AC] without a hardcoded kind ranking. No
 * markers at all classifies as `"unknown"`.
 */
export function classifyTarget(markers: TargetMarkers): TargetKind | "unknown" {
	return markers[0] ?? "unknown";
}

/** Resolves a name/link click: honours the configured action; modifier inverts it. */
function resolveNameOutcome(modifier: boolean, linkClickAction: LinkClickAction): NavigationOutcome {
	const defaultIsInspect = linkClickAction === "drill";
	const isInspect = modifier ? !defaultIsInspect : defaultIsInspect;
	return { action: isInspect ? "inspect" : "openNote" };
}

/**
 * Resolves a card title click: the setting says whether a plain click opens
 * the note in a new tab or does what the card body does (inspect); a modifier
 * inverts the two.
 */
function resolveCardTitleOutcome(modifier: boolean, opensNote: boolean): NavigationOutcome {
	const opensInTab = modifier ? !opensNote : opensNote;
	return { action: opensInTab ? "openNoteInTab" : "inspect" };
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
	cardTitleOpensNote = true,
): NavigationOutcome {
	switch (kind) {
		case "name":
			return resolveNameOutcome(modifier, linkClickAction);
		case "cardTitle":
			return resolveCardTitleOutcome(modifier, cardTitleOpensNote);
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
	/** Reads the live `cardTitleOpensNote` setting per click. Absent means the shipped default, `true`. */
	readonly getCardTitleOpensNote?: () => boolean;
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
			const outcome = resolveNavigationOutcome(
				kind,
				modifier,
				deps.getLinkClickAction(),
				deps.getCardTitleOpensNote?.() ?? true,
			);
			if (outcome.action === "inspect") deps.inspect();
			return outcome;
		},
	};
}
