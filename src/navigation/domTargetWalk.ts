/**
 * domTargetWalk — the one DOM-touching step that feeds `navigationController.ts`.
 *
 * `navigationController.ts` classifies a click from a `TargetMarkers` array and
 * stays free of any DOM/Obsidian dependency by design (its own docstring). Something
 * still has to *build* that array from a real click, though, and building it
 * correctly is the load-bearing part: markers must be **nearest-first** — the
 * order produced by walking up from `event.target` — so a name nested inside a
 * structural control (the timeline act label sitting inside its section header's
 * `data-sf-section-toggle`, see `src/workspace/renderTimeline.ts`) resolves to
 * "name" while the control's own chrome resolves to "structuralControl".
 *
 * T2.5 found this walk duplicated near-identically in `AnvilView` and
 * `SidebarView` — two hand-maintained copies of a proximity walk in the one
 * place that had just had a proximity bug. This module is the single
 * implementation both hosts call; only the marker vocabulary (which
 * attributes mean what) stays per-surface, because that vocabulary genuinely
 * differs between the Anvil and the Workbench.
 *
 * Deliberately its own module beside `navigationController.ts`, not inside
 * it: this one touches `HTMLElement`, so it stays out of the DOM-free module
 * that must remain unit-testable without a vault.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import type { TargetKind, TargetMarkers } from "./navigationController";

/** Classifies a single DOM node's marker kind, or `null` if it carries none. */
export type MarkerKindOf = (el: HTMLElement) => TargetKind | null;

/** The result of walking up from a click target: markers plus the element that produced the nearest one. */
export interface WalkedTarget {
	/** Nearest-first ordered marker kinds — feeds `classifyTarget`/`resolveNavigationOutcome`. */
	readonly markers: TargetMarkers;
	/**
	 * The element that produced `markers[0]` (or `null` when `markers` is
	 * empty). This is the one piece of surface-specific identity — which
	 * link, which control — that `navigationController.ts` intentionally
	 * never sees; a host needs it to actually enact whatever the controller
	 * decides.
	 */
	readonly nearest: HTMLElement | null;
}

/**
 * Walk up the DOM ancestor chain from `start` (inclusive) to `root`
 * (inclusive), pushing each recognised marker kind **nearest first**.
 *
 * Stops as soon as `root` has been visited. If `root` is never encountered —
 * `start` is detached, or simply not a descendant of `root` — the walk still
 * terminates safely once `parentElement` runs out (never throws, never
 * loops).
 */
export function walkTargetMarkers(
	start: HTMLElement,
	root: HTMLElement,
	markerKindOf: MarkerKindOf,
): WalkedTarget {
	const markers: TargetKind[] = [];
	let nearest: HTMLElement | null = null;
	let el: HTMLElement | null = start;
	while (el) {
		const kind = markerKindOf(el);
		if (kind) {
			markers.push(kind);
			if (nearest === null) nearest = el;
		}
		if (el === root) break;
		el = el.parentElement;
	}
	return { markers, nearest };
}
