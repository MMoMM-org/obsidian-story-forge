/**
 * PanelDeps — shared dependency surface for panel renderers.
 *
 * Renderers are pure DOM builders that accept a context snapshot. They don't
 * own navigation or state; callers inject these capabilities via PanelDeps.
 *
 * - `onOpenLink` — open a file or path in Obsidian (wired by SidebarView, T3.5)
 * - `collapsed`  — persistent collapsed-state map keyed by section id
 * - `toggleCollapse` — flip the collapsed state for a section id
 *
 * @ref SDD/ADR-2 (pure DOM renderers, deps injected from view)
 * @ref T3.5 (NativeScopingEngine dispatch wires onOpenLink)
 */

export interface PanelDeps {
	/** Open a linked note. The path is the TFile path or wikilink target. */
	onOpenLink: (path: string) => void;
	/** Section collapse state, keyed by a stable section identifier. */
	collapsed: Record<string, boolean>;
	/** Toggle the collapsed state for the given section id. */
	toggleCollapse: (sectionId: string) => void;
}
