/**
 * Story Forge plugin constants.
 *
 * Single source of truth for view type identifiers, icons, and timing values.
 * Imported by SidebarView, main.ts, and test helpers.
 */

/** The view type identifier for the sidebar panel. Stable — never change after first release. */
export const SIDEBAR_VIEW_TYPE = "story-forge-panel";

/**
 * The Bases view id for the one polymorphic Codex view type (ADR-2).
 * Stable — never change after first release (CON-4): renaming the id orphans
 * every `.base` file (curated or generated) that references it.
 *
 * Single source of truth — imported by BasesAdapter.ts (registration) and
 * baseGenerator.ts (rendered `.base` templates) so both stay in lockstep.
 */
export const CODEX_VIEW_ID = "story-forge-codex";

/** Sentinel data-view-id for the fixed Navigator tab in the sidebar (M5). */
export const NAVIGATOR_TAB_ID = "__navigator__";

/** Lucide icon name for the sidebar panel and ribbon button. */
export const ICON = "book-open";

/** Debounce delay in milliseconds for the active-leaf-change follow pipeline. */
export const DEBOUNCE_MS = 200;
