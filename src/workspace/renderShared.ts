/**
 * renderShared — small DOM helpers shared by the workspace renderers.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-3.md
 */

import { plotlineColor, stripLink, type SceneRow } from "./workspaceModel";

/** Neutral dot color (theme token) for scenes with no plotline. */
export const NEUTRAL_DOT_COLOR = "var(--text-faint)";

/** Dot color for a scene: its first plotline's color, else neutral. */
export function rowColor(row: SceneRow): string {
	const first = row.plotlines[0];
	return first !== undefined ? plotlineColor(stripLink(first)) : NEUTRAL_DOT_COLOR;
}

/** CSS-class-safe slug for a status value ("In Progress" → "in-progress"). */
export function statusSlug(status: string): string {
	return status
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Append a colored dot to `parent` (inline, data-driven color). */
export function appendDot(parent: HTMLElement, cls: string, color: string): HTMLElement {
	const dot = parent.createEl("span", { cls });
	dot.style.background = color;
	return dot;
}

/** Append a status badge to `parent`; skips an empty status. */
export function appendStatusBadge(parent: HTMLElement, status: string): HTMLElement | null {
	if (status === "") return null;
	return parent.createEl("span", { cls: `sf-tl-st sf-tl-st--${statusSlug(status)}`, text: status });
}
