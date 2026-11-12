/**
 * renderScene — Context-tab body renderer for scene notes.
 *
 * Renders mockup state S39 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Subtitle line (optional: only when frontmatter.subtitle is set)
 *   2. Facts   (scene fact fields; book relation rendered as a link row in Facts body)
 *   3. Point of view  (entities field==="pov"; pov tag)
 *   4. Characters     (entities field==="characters"; count badge)
 *   5. Location       (entities field==="location"; single link or emptyLine)
 *   6. Plotlines      (entities field==="plotlines"; count badge)
 *   7. Reading order  (prev / next link rows; em-dash when absent)
 *
 * @ref mockups.html S39
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

declare const activeDocument: Document;

import {
	section,
	factRow,
	linkRow,
	relationRow,
	stampLinkEl,
	emptyLine,
	unresolvedEl,
	humanizeFieldLabel,
	factValueEl,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";
import { claimLinks, type SectionCandidate } from "panel/collectionSections";

// ---------------------------------------------------------------------------
// renderScene
// ---------------------------------------------------------------------------

/**
 * Render the scene context panel into `el`.
 *
 * @param ctx  The resolved note context for a scene note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderScene(
	ctx: NoteContext,
	el: HTMLElement,
	deps: PanelDeps,
): void {
	const { frontmatter, entities } = ctx;

	renderSubtitle(el, frontmatter);
	renderFacts(el, frontmatter, entities);
	// T7.1d3: the cast and the place a Workbench-on built-in claims are its sections, not these.
	const stays = claimLinks(el, linkCandidates(entities), deps.collections);
	const quiet = deps.collections !== undefined;
	renderPointOfView(el, entities.filter(stays), quiet);
	renderCharacters(el, entities.filter(stays), quiet);
	renderLocation(el, entities.filter(stays), quiet);
	renderPlotlines(el, entities);
	renderReadingOrder(el, entities);
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

/** The links to built-in collections this panel draws, each under its own field (pov, characters, location). */
function linkCandidates(entities: ResolvedEntity[]): SectionCandidate[] {
	return entities
		.filter((e) => e.field === "pov" || e.field === "characters" || e.field === "location")
		.map((entity): SectionCandidate => ({ entity, key: entity.field ?? "" }));
}

function renderSubtitle(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const subtitle = frontmatter["subtitle"];
	if (typeof subtitle !== "string" || !subtitle) return;

	// Wrap in straight quotes (mockup S39 shows `"Mara finds the lens gone cold."`).
	const subtitleEl = activeDocument.createElement("div");
	subtitleEl.className = "sf-subtitle";
	subtitleEl.textContent = `"${subtitle}"`;
	el.appendChild(subtitleEl);
}

function renderFacts(
	el: HTMLElement,
	frontmatter: Record<string, unknown>,
	entities: ResolvedEntity[],
): void {
	// subtitle is rendered separately as a dedicated subtitle line (not a factRow)
	const facts = kindFields("scene").facts.filter((f) => f !== "subtitle");
	const bookEntities = entities.filter((e) => e.field === "book");
	const presentFacts = facts.filter((f) => frontmatter[f] !== undefined);

	if (presentFacts.length === 0 && bookEntities.length === 0) return;

	const { bodyEl } = section(el, "Facts");

	for (const field of presentFacts) {
		factRow(bodyEl, humanizeFieldLabel(field), factValueEl(frontmatter[field]));
	}

	for (const e of bookEntities) {
		if (e.unresolved) {
			bodyEl.appendChild(unresolvedEl(e.file.basename));
		} else {
			linkRow(bodyEl, e.file.basename, { path: e.file.path });
		}
	}
}

function renderPointOfView(el: HTMLElement, entities: ResolvedEntity[], omitWhenEmpty: boolean): void {
	const povEntities = entities.filter((e) => e.field === "pov");
	if (omitWhenEmpty && povEntities.length === 0) return;
	const { bodyEl } = section(el, "Point of view");

	if (povEntities.length === 0) {
		emptyLine(bodyEl, "No point of view yet.");
		return;
	}

	for (const e of povEntities) {
		if (e.unresolved) {
			bodyEl.appendChild(unresolvedEl(e.file.basename));
		} else {
			linkRow(bodyEl, e.file.basename, { tag: "pov", path: e.file.path });
		}
	}
}

function renderCharacters(el: HTMLElement, entities: ResolvedEntity[], omitWhenEmpty: boolean): void {
	const charEntities = entities.filter((e) => e.field === "characters");
	if (omitWhenEmpty && charEntities.length === 0) return;
	const { bodyEl } = section(el, "Characters", { count: charEntities.length });

	if (charEntities.length === 0) {
		emptyLine(bodyEl, "No characters yet.");
		return;
	}

	for (const e of charEntities) {
		if (e.unresolved) {
			bodyEl.appendChild(unresolvedEl(e.file.basename));
		} else {
			linkRow(bodyEl, e.file.basename, { path: e.file.path });
		}
	}
}

function renderLocation(el: HTMLElement, entities: ResolvedEntity[], omitWhenEmpty: boolean): void {
	const locEntities = entities.filter((e) => e.field === "location");
	if (omitWhenEmpty && locEntities.length === 0) return;
	const { bodyEl } = section(el, "Location");

	if (locEntities.length === 0) {
		emptyLine(bodyEl, "No location yet.");
		return;
	}

	for (const e of locEntities) {
		if (e.unresolved) {
			bodyEl.appendChild(unresolvedEl(e.file.basename));
		} else {
			linkRow(bodyEl, e.file.basename, { path: e.file.path });
		}
	}
}

function renderPlotlines(el: HTMLElement, entities: ResolvedEntity[]): void {
	const plotEntities = entities.filter((e) => e.field === "plotlines");
	const { bodyEl } = section(el, "Plotlines", { count: plotEntities.length });

	if (plotEntities.length === 0) {
		emptyLine(bodyEl, "No plotlines yet.");
		return;
	}

	for (const e of plotEntities) {
		if (e.unresolved) {
			bodyEl.appendChild(unresolvedEl(e.file.basename));
		} else {
			linkRow(bodyEl, e.file.basename, { path: e.file.path });
		}
	}
}

function renderReadingOrder(el: HTMLElement, entities: ResolvedEntity[]): void {
	const { bodyEl } = section(el, "Reading order");
	renderNavSlot(bodyEl, "prev", entities);
	renderNavSlot(bodyEl, "next", entities);
}

// ---------------------------------------------------------------------------
// Private utilities
// ---------------------------------------------------------------------------

/**
 * Render a single prev/next navigation slot in the Reading order section.
 *
 * Both prev and next are ALWAYS shown as a labelled relation row (mockup S39):
 *   - present + resolved   → label + clickable link
 *   - present + unresolved → label + muted unresolved element
 *   - absent               → label + em-dash placeholder
 * The label is never dropped, so prev/next read consistently.
 */
function renderNavSlot(
	bodyEl: HTMLElement,
	slot: "prev" | "next",
	entities: ResolvedEntity[],
): void {
	const match = entities.find((e) => e.field === slot);

	let valueEl: HTMLElement;
	if (!match) {
		valueEl = activeDocument.createElement("span");
		valueEl.className = "sf-rel-dash";
		valueEl.textContent = "—";
	} else if (match.unresolved) {
		valueEl = unresolvedEl(match.file.basename);
	} else {
		valueEl = stampLinkEl(match.file.basename, match.file.path);
	}

	relationRow(bodyEl, slot, [valueEl]);
}
