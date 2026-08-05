/**
 * markerVocabulary — the one attribute → TargetKind map shared by AnvilView
 * and SidebarView's `_markerKindOf` (ADR-28, T2.5 gap closure).
 *
 * Both hosts hand-rolled an identical if-chain over the same marker
 * attributes, differing only in which attributes each host recognises
 * (SidebarView has no selection store, so it deliberately omits the Codex
 * collection pill) and in check *order* (see `navigationController.ts`'s
 * docstring on why order matters for markers that never nest). This module
 * factors the shared vocabulary while keeping both differences: a per-host
 * whitelist controls which attributes are recognised, and the whitelist's
 * array order controls which one wins when an element improbably carries
 * more than one.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import {
	MARKER_VOCABULARY,
	createMarkerKindOf,
	ANVIL_MARKERS,
	SIDEBAR_MARKERS,
} from "navigation/markerVocabulary";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import { CODEX_COLLECTION_ATTR, CODEX_CARD_BODY_ATTR } from "codex/codexTab";

function el(tag = "div"): HTMLElement {
	return document.createElement(tag);
}

describe("MARKER_VOCABULARY", () => {
	it("maps every known marker attribute to its correct TargetKind", () => {
		expect(MARKER_VOCABULARY).toEqual({
			"data-sf-link": "name",
			[CODEX_CARD_BODY_ATTR]: "cardBody",
			"data-ws-layout": "structuralControl",
			"data-ws-tlmode": "structuralControl",
			[CODEX_COLLECTION_ATTR]: "structuralControl",
			"data-sf-card": "structuralControl",
			"data-sf-section-toggle": "structuralControl",
			"data-sf-cx-change-tag": "structuralControl",
			"data-sf-cx-hint-dismiss": "structuralControl",
			// T5.1: the editor pane's header tools (close / fullscreen / back / dock).
			"data-sf-ed-tool": "structuralControl",
			"data-sf-plotline": "structuralControl",
			"data-sf-nav": "structuralControl",
		});
	});
});

describe("createMarkerKindOf", () => {
	it("classifies a recognised marker per the shared vocabulary", () => {
		const kindOf = createMarkerKindOf(["data-sf-link"]);
		const node = el();
		node.setAttribute("data-sf-link", "some/path.md");

		expect(kindOf(node)).toBe("name");
	});

	it("returns null for an attribute the vocabulary knows but the whitelist omits", () => {
		const kindOf = createMarkerKindOf(["data-sf-link"]); // CODEX_COLLECTION_ATTR not listed
		const node = el();
		node.setAttribute(CODEX_COLLECTION_ATTR, "collection-1");

		expect(kindOf(node)).toBeNull();
	});

	it("returns null for an element carrying no recognised attribute at all", () => {
		const kindOf = createMarkerKindOf(["data-sf-link"]);
		expect(kindOf(el())).toBeNull();
	});

	it("host filtering: the same element classifies differently under each host's whitelist", () => {
		const node = el();
		node.setAttribute(CODEX_COLLECTION_ATTR, "collection-1");

		const anvilKindOf = createMarkerKindOf(ANVIL_MARKERS);
		const sidebarKindOf = createMarkerKindOf(SIDEBAR_MARKERS);

		// Anvil has a selection store to act on the collection pill.
		expect(anvilKindOf(node)).toBe("structuralControl");
		// Sidebar deliberately has no selection store — omission preserved.
		expect(sidebarKindOf(node)).toBeNull();
	});

	it("respects whitelist order: the first listed attribute present wins", () => {
		const node = el();
		node.setAttribute("data-sf-link", "some/path.md");
		node.setAttribute("data-sf-section-toggle", "");

		const linkFirst = createMarkerKindOf(["data-sf-link", "data-sf-section-toggle"]);
		const toggleFirst = createMarkerKindOf(["data-sf-section-toggle", "data-sf-link"]);

		expect(linkFirst(node)).toBe("name");
		expect(toggleFirst(node)).toBe("structuralControl");
	});
});

describe("walk integration — whitelist honoured through the real DOM walk", () => {
	it("the same DOM tree yields different markers for the Anvil vs the Sidebar whitelist", () => {
		// A structural control (collection pill) with a name nested inside it —
		// mirrors the real Codex markup shape (pill -> ... -> link).
		const root = el();
		const pill = el();
		pill.setAttribute(CODEX_COLLECTION_ATTR, "collection-1");
		const link = el();
		link.setAttribute("data-sf-link", "characters/aria.md");
		root.appendChild(pill);
		pill.appendChild(link);

		const anvilKindOf = createMarkerKindOf(ANVIL_MARKERS);
		const sidebarKindOf = createMarkerKindOf(SIDEBAR_MARKERS);

		const anvilWalk = walkTargetMarkers(link, root, anvilKindOf);
		const sidebarWalk = walkTargetMarkers(link, root, sidebarKindOf);

		// Both see the nested name nearest-first...
		expect(anvilWalk.markers[0]).toBe("name");
		expect(sidebarWalk.markers[0]).toBe("name");
		// ...but only the Anvil's whitelist also picks up the collection pill.
		expect(anvilWalk.markers).toEqual(["name", "structuralControl"]);
		expect(sidebarWalk.markers).toEqual(["name"]);
	});

	it("ANVIL_MARKERS recognises the Codex card body distinctly from a structural control", () => {
		const root = el();
		const card = el();
		card.setAttribute(CODEX_CARD_BODY_ATTR, "characters/aria.md");
		root.appendChild(card);

		const anvilKindOf = createMarkerKindOf(ANVIL_MARKERS);
		const { markers } = walkTargetMarkers(card, root, anvilKindOf);

		expect(markers).toEqual(["cardBody"]);
	});
});
