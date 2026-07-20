/**
 * renderLocation — Context-tab body renderer for location notes.
 *
 * Renders mockup state S36 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Image tile    (optional: only when frontmatter.image is set)
 *   2. Facts         (locationType/region/aliases/first_appearance; absent fields skipped)
 *   3. Within        (breadcrumb from entities[field==="world"]; omitted at top-level)
 *   4. Inhabitants   (outgoing entities[field==="inhabitants"]; count badge)
 *   5. Scenes here   (backlinks where kind==="scene" && field==="location"; count badge)
 *   6. Child locations (optional: backlinks where kind==="location" && field==="world")
 *
 * DV-2: The Within breadcrumb is a single level — we do NOT recurse the world chain.
 * ADR-7: location renderer.
 *
 * @ref mockups.html S36
 * @ref SDD/ADR-7, DV-2
 */

declare const activeDocument: Document;

import {
	section,
	factRow,
	linkRow,
	emptyLine,
	imageTile,
	unresolvedEl,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

/**
 * Render the location context panel into `el`.
 *
 * @param ctx  The resolved note context for a location note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderLocation(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;
	const basename = ctx.activeFile.basename;

	const image = typeof frontmatter["image"] === "string" ? frontmatter["image"] : undefined;
	imageTile(el, image);

	renderFacts(el, frontmatter);
	renderWithin(el, basename, entities);
	renderInhabitants(el, entities);
	renderScenesHere(el, backlinks);
	renderChildLocations(el, backlinks);
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const fields = kindFields("location").facts;
	const presentFields = fields.filter((f) => frontmatter[f] !== undefined);
	if (presentFields.length === 0) return;

	const { bodyEl } = section(el, "Facts");
	for (const field of presentFields) {
		const value = frontmatter[field];
		const display = Array.isArray(value) ? value.join(", ") : String(value);
		factRow(bodyEl, field, display);
	}
}

function renderWithin(
	el: HTMLElement,
	basename: string,
	entities: ResolvedEntity[],
): void {
	const worldEntities = entities.filter((e) => e.field === "world");
	if (worldEntities.length === 0) return;

	const { bodyEl } = section(el, "Within");
	const parent = worldEntities[0]!;

	if (parent.unresolved) {
		bodyEl.appendChild(unresolvedEl(parent.file.basename));
		return;
	}

	renderBreadcrumb(bodyEl, parent.file.basename, basename);
}

function renderBreadcrumb(
	bodyEl: HTMLElement,
	parentName: string,
	currentName: string,
): void {
	const crumbEl = activeDocument.createElement("div");
	crumbEl.className = "sf-breadcrumb";

	const parentSpan = activeDocument.createElement("span");
	parentSpan.className = "sf-lrow-lnk";
	parentSpan.textContent = parentName;
	parentSpan.setAttribute("tabindex", "0");
	parentSpan.setAttribute("role", "link");
	crumbEl.appendChild(parentSpan);

	const sepSpan = activeDocument.createElement("span");
	sepSpan.className = "sf-breadcrumb-sep";
	sepSpan.textContent = " › ";
	crumbEl.appendChild(sepSpan);

	const curSpan = activeDocument.createElement("span");
	curSpan.className = "sf-breadcrumb-cur";
	curSpan.textContent = currentName;
	crumbEl.appendChild(curSpan);

	bodyEl.appendChild(crumbEl);
}

function renderInhabitants(el: HTMLElement, entities: ResolvedEntity[]): void {
	const inhabitants = entities.filter((e) => e.field === "inhabitants");
	const { bodyEl } = section(el, "Inhabitants", { count: inhabitants.length });

	if (inhabitants.length === 0) {
		emptyLine(bodyEl, "No inhabitants yet.");
		return;
	}

	for (const e of inhabitants) {
		linkRow(bodyEl, e.file.basename);
	}
}

function renderScenesHere(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	const scenes = backlinks.filter(
		(b) => b.kind === "scene" && b.field === "location",
	);
	const { bodyEl } = section(el, "Scenes here", { count: scenes.length });

	if (scenes.length === 0) {
		emptyLine(bodyEl, "No scenes here yet.");
		return;
	}

	for (const bl of scenes) {
		linkRow(bodyEl, bl.file.basename);
	}
}

function renderChildLocations(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	const children = backlinks.filter(
		(b) => b.kind === "location" && b.field === "world",
	);
	if (children.length === 0) return;

	const { bodyEl } = section(el, "Locations", { count: children.length });
	for (const bl of children) {
		linkRow(bodyEl, bl.file.basename);
	}
}
