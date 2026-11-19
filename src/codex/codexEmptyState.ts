/**
 * codexEmptyState — S98: a collection whose tag is configured but matched no
 * notes. Extracted out of `codexTab.ts` alongside `basesHint.ts` (a T4.4
 * code-quality follow-up already anticipated this split — see
 * `cardSelector.ts`'s module doc) so T4.6's own concerns don't land in a file
 * that already carries markup building, collection defaults and selection
 * state.
 *
 * **Correction 2026-08-04 (T4.6 plan gate) — the actions are `Change tag` and
 * `What are FileClasses?`, NOT *Set up my vault…*.** S98's own caption
 * withdraws that action: seeding the vault is out of scope and lives entirely
 * in #27; the *Set up my vault…* action "returns with #27". A vault without
 * FileClasses is a supported configuration served by the editor's tier-2
 * fallback, not a broken one — this empty state must not imply otherwise.
 *
 * Distinct from the "misconfigured" (empty-tag) case, which `codexTab.ts`
 * still renders inline as plain text — S98 does not cover that case, and the
 * plan is explicit that a misconfigured collection only "says so", with no
 * actions to offer (there is no tag to change TO here; the tag is missing,
 * not merely unmatched).
 *
 * `Change tag` carries a marker (`CODEX_CHANGE_TAG_ATTR`, ADR-28 — "contribute
 * a marker, let the host decide") rather than an injected App-touching
 * callback, the same discipline the collection pills and Card selector
 * follow: this module stays App-free and the host resolves what "open
 * Settings" means. `What are FileClasses?` is a plain external link — no host
 * action needed, so no marker.
 *
 * @ref docs/XDD/specs/008-codex-surface/mockups.html — S98
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F3
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6
 */

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts;
// same local declaration codexTab.ts / cardSelector.ts use).
declare const activeDocument: Document;

/**
 * Marks the "Change tag" action. Hosts classify it as `"structuralControl"`
 * and read the attribute's value (the collection id) to open Settings.
 */
export const CODEX_CHANGE_TAG_ATTR = "data-sf-cx-change-tag";

/** Public documentation for metadata-menu's FileClass concept ("What are FileClasses?"). */
const FILECLASSES_DOC_URL = "https://mdelobelle.github.io/metadatamenu/fileclasses/";

export interface CodexEmptyStateOptions {
	/** The collection's id — the `Change tag` marker's value. */
	readonly collectionId: string;
	/** The collection's display label (e.g. "Characters"), lowercased for the heading. */
	readonly label: string;
	/**
	 * The tag this collection looked for (no leading `#`) — a USER SETTING
	 * value, so it is written via `textContent`, never `innerHTML` (XSS-safe DOM
	 * gate).
	 */
	readonly tag: string;
}

/**
 * Render the S98 empty state into `container` (append, not replace — the
 * caller owns emptying its own host, same as `codexTab.ts`'s other render
 * helpers).
 */
export function renderCodexEmptyState(container: HTMLElement, opts: CodexEmptyStateOptions): HTMLElement {
	const box = activeDocument.createElement("div");
	box.className = "sf-cx-empty";
	box.setAttribute("data-sf-cx-empty", opts.tag);

	const glyph = activeDocument.createElement("div");
	glyph.className = "sf-cx-empty-ic";
	glyph.textContent = "⚒";
	box.appendChild(glyph);

	const heading = activeDocument.createElement("b");
	heading.className = "sf-cx-empty-heading";
	// opts.label is plugin-defined collection metadata (not raw user free text),
	// but textContent throughout this function regardless — same XSS-safe
	// discipline as the tag below.
	heading.textContent = `No ${opts.label.toLowerCase()} found`;
	box.appendChild(heading);

	const detail = activeDocument.createElement("div");
	detail.className = "sf-cx-empty-detail";
	detail.append("This collection looks for notes tagged ");
	const code = activeDocument.createElement("code");
	code.textContent = opts.tag; // XSS-safe: textContent — tag is a user settings value.
	detail.appendChild(code);
	detail.append(". Nothing matched.");
	box.appendChild(detail);

	const actions = activeDocument.createElement("div");
	actions.className = "sf-cx-empty-actions";

	const changeTagBtn = activeDocument.createElement("button");
	changeTagBtn.type = "button";
	changeTagBtn.className = "sf-btn sf-btn-primary sf-cx-empty-action";
	changeTagBtn.textContent = "Change tag";
	changeTagBtn.setAttribute(CODEX_CHANGE_TAG_ATTR, opts.collectionId);
	actions.appendChild(changeTagBtn);

	const docsLink = activeDocument.createElement("a");
	docsLink.className = "sf-btn sf-cx-empty-action";
	docsLink.textContent = "What are FileClasses?";
	docsLink.href = FILECLASSES_DOC_URL;
	// noopener: an external link rendered in a plugin pane must not let the
	// destination page reach back via window.opener (tabnabbing) if it is ever
	// opened in a new browsing context.
	docsLink.rel = "noopener";
	actions.appendChild(docsLink);

	box.appendChild(actions);
	container.appendChild(box);
	return box;
}

/**
 * S98's degrade path for a `.base` collection while Bases is off (L6a, "like every Bases surface").
 * Nothing is embedded; the page says why, and the ADR-36 hint above it already says how to fix it.
 * Append, not replace (same contract as `renderCodexEmptyState`).
 */
export function renderBasesOffState(container: HTMLElement, label: string): HTMLElement {
	const box = activeDocument.createElement("div");
	box.className = "sf-cx-empty sf-cx-empty--bases-off";
	const glyph = activeDocument.createElement("div");
	glyph.className = "sf-cx-empty-ic";
	glyph.textContent = "⚒";
	box.appendChild(glyph);
	const heading = activeDocument.createElement("b");
	heading.className = "sf-cx-empty-heading";
	heading.textContent = `${label} needs Bases`;
	box.appendChild(heading);
	const detail = activeDocument.createElement("div");
	detail.className = "sf-cx-empty-detail";
	detail.textContent = "This collection is a Bases file, and the core Bases plugin is turned off.";
	box.appendChild(detail);
	container.appendChild(box);
	return box;
}
