/**
 * basesHint — ADR-36's single dismissible capability hint: shown only when
 * Bases is present-but-disabled (`basesCapability(...) === "disabled"`,
 * `bases/basesCapability.ts`). Never shown for "absent" (an old Obsidian —
 * silence, not a broken install) or "enabled" (nothing to say). A missing
 * COMMUNITY plugin (Dataview, metadata-menu) is never routed through this
 * module at all — there is no capability input here for one, by
 * construction, matching ADR-36's "core may be suggested once; community
 * never" (community disclosure lives in `SettingsTab.ts`'s Views list only,
 * per F8 — never a nag).
 *
 * Dismissal is permanent: the host persists `BASES_DISABLED_HINT_ID` into
 * `PluginSettings.dismissedHints` (CON-2, data.json — operational state,
 * never a note). This module never touches settings itself — the dismiss
 * button carries a marker (`CODEX_HINT_DISMISS_ATTR`, ADR-28), and the host
 * resolves what "persist a dismissal" means, the same "contribute a marker,
 * let the host decide" discipline `codexEmptyState.ts` and the collection
 * pills follow.
 *
 * @ref SDD/ADR-36 — core may be suggested once; community never
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4 AC
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6
 */

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

/** Stable id persisted in `PluginSettings.dismissedHints` for this hint. */
export const BASES_DISABLED_HINT_ID = "bases-disabled";

/**
 * Marks the hint's dismiss control. Hosts classify it as
 * `"structuralControl"` and read the attribute's value (the hint id) to
 * persist the dismissal.
 */
export const CODEX_HINT_DISMISS_ATTR = "data-sf-cx-hint-dismiss";

/**
 * Render the ADR-36 hint into `container` (append, not replace — matches
 * `codexEmptyState.ts` and `codexTab.ts`'s other render helpers).
 */
export function renderBasesHint(container: HTMLElement): HTMLElement {
	const box = activeDocument.createElement("div");
	box.className = "sf-cx-hint";
	box.setAttribute("role", "status");

	const text = activeDocument.createElement("span");
	// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Bases' is Obsidian's proper noun for the core plugin
	text.textContent = "Enabling the core Bases plugin adds more Card options.";
	box.appendChild(text);

	const dismiss = activeDocument.createElement("button");
	dismiss.type = "button";
	dismiss.className = "sf-cx-hint-dismiss";
	dismiss.setAttribute("aria-label", "Dismiss");
	dismiss.textContent = "✕";
	dismiss.setAttribute(CODEX_HINT_DISMISS_ATTR, BASES_DISABLED_HINT_ID);
	box.appendChild(dismiss);

	container.appendChild(box);
	return box;
}
