/**
 * renderObject — Context-tab body renderer for object notes.
 *
 * Renders mockup state S37 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Image tile  (optional: only when frontmatter.image is set)
 *   2. Facts       (kind/aliases/first_appearance; absent fields skipped)
 *   3. Owner       (single entity where field==="owner"; empty → "Unowned.")
 *   4. Appears in  (backlinks where kind==="scene"; incl. fuzzy:true — ADR-8)
 *
 * @ref mockups.html S37
 * @ref SDD/ADR-8 (fuzzy backlinks included for object "appears in")
 */

import {
	section,
	factRow,
	linkRow,
	emptyLine,
	imageTile,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

/**
 * Render the object context panel into `el`.
 *
 * @param ctx  The resolved note context for an object note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderObject(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;

	const image = typeof frontmatter["image"] === "string" ? frontmatter["image"] : undefined;
	imageTile(el, image);

	renderFacts(el, frontmatter);
	renderOwner(el, entities);
	renderAppearsIn(el, backlinks);
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const fields = kindFields("object").facts;
	const presentFields = fields.filter((f) => frontmatter[f] !== undefined);
	if (presentFields.length === 0) return;

	const { bodyEl } = section(el, "Facts");
	for (const field of presentFields) {
		const value = frontmatter[field];
		const display = Array.isArray(value) ? value.join(", ") : String(value);
		factRow(bodyEl, field, display);
	}
}

function renderOwner(el: HTMLElement, entities: ResolvedEntity[]): void {
	const ownerEntities = entities.filter((e) => e.field === "owner");
	const { bodyEl } = section(el, "Owner");

	if (ownerEntities.length === 0) {
		emptyLine(bodyEl, "Unowned.");
		return;
	}

	// Owner is a single entity (per schema); render the first one
	linkRow(bodyEl, ownerEntities[0]!.file.basename);
}

function renderAppearsIn(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	// ADR-8: include fuzzy:true entries — objects appear in scenes via body links
	const scenes = backlinks.filter((b) => b.kind === "scene");
	const { bodyEl } = section(el, "Appears in", { count: scenes.length });

	if (scenes.length === 0) {
		emptyLine(bodyEl, "No scenes yet.");
		return;
	}

	for (const bl of scenes) {
		linkRow(bodyEl, bl.file.basename);
	}
}
