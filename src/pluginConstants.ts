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
 * Single source of truth — every module that registers, renders, or emits
 * this id must import it from here rather than declaring its own copy, so
 * they cannot drift out of lockstep with each other.
 */
export const CODEX_VIEW_ID = "story-forge-codex";

/**
 * Bases view ids for the three built-in Cards (Hero, Table, Compact),
 * registered directly via `registerBasesView` (T4.5) so a user can pick
 * "Story Forge Hero" etc. as a view type inside their own `.base` file —
 * independent of, and in addition to, the polymorphic `CODEX_VIEW_ID` grid.
 * Stable — never change after first release (CON-4): renaming any of them
 * orphans every `.base` that references it.
 */
export const CODEX_HERO_VIEW_ID = "story-forge-hero";
export const CODEX_TABLE_VIEW_ID = "story-forge-table";
export const CODEX_COMPACT_VIEW_ID = "story-forge-compact";

/**
 * The view type identifier for the Anvil (the main-window surface; ADR-27).
 * Stable — never change after first release (CON-4): renaming the id orphans every saved
 * workspace layout that contains the leaf. The surface's *display* name may change freely
 * (`getDisplayText`) — only this identifier is frozen.
 *
 * Formerly declared in `src/workspace/WorkspaceView.ts`, consolidated here (spec 008, T2.1)
 * for the same reason `CODEX_VIEW_ID` was: a single source of truth so importers cannot
 * drift out of lockstep with each other.
 */
export const WORKSPACE_VIEW_TYPE = "story-forge-workspace";

/** Sentinel data-view-id for the fixed Navigator tab in the sidebar (M5). */
export const NAVIGATOR_TAB_ID = "__navigator__";

/** Lucide icon name for the sidebar panel and ribbon button. */
export const ICON = "book-open";

/** Debounce delay in milliseconds for the active-leaf-change follow pipeline. */
export const DEBOUNCE_MS = 200;
