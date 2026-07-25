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

/**
 * Deterministic accent color for a Kanban column header, keyed by status name.
 * Falls back to a neutral theme token for unrecognized statuses.
 *
 * Color palette chosen to be theme-agnostic (CSS vars or direct colors):
 *  idea → muted blue-grey, outline → soft teal, draft → amber, revised → blue,
 *  done → green, final → purple. "No status" → text-faint.
 */
const STATUS_COLUMN_COLORS: Record<string, string> = {
	idea:    "var(--color-base-50)",
	outline: "#4bb6ab",
	draft:   "#d9a441",
	revised: "#5b8bd0",
	done:    "#6ac47a",
	final:   "#8a7cf0",
};

export function statusColumnColor(status: string): string {
	return STATUS_COLUMN_COLORS[status] ?? "var(--text-faint)";
}
