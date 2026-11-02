/**
 * relationPillLinks.test.ts — relation pills behave like links.
 *
 * A pill whose value is a wikilink carries `data-sf-link` (the TARGET, no
 * brackets/alias/heading); a pill whose value is plain text carries nothing —
 * a marker that resolves to nothing would make a click do nothing while the
 * pill looked clickable. Precedence over the card body is asserted through the
 * REAL `walkTargetMarkers` + `ANVIL_MARKERS`, on markup built by the REAL
 * `buildCardWrapper`, on both backends' entry adapters.
 */

import { describe, expect, it } from "vitest";
import "../../__mocks__/obsidian";
import { basesCardEntry, nativeCardEntry, type CardEntry, type CardRenderer } from "codex/cardRegistry";
import { buildCardWrapper } from "codex/cardWrapper";
import { entryPills } from "codex/cards/shared";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import { ANVIL_MARKERS, createMarkerKindOf } from "navigation/markerVocabulary";

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";

function pillCard(fieldId: string): CardRenderer {
	return {
		id: "pills",
		label: "Pills",
		render(entry: CardEntry, el: HTMLElement): void {
			for (const pill of entryPills(entry, fieldId)) el.appendChild(pill);
		},
	};
}

function nativeWrapper(value: unknown): HTMLElement {
	return buildCardWrapper(nativeCardEntry(PATH, { allies: value }), pillCard("allies"), {
		compact: false,
		resolveAsset: (raw) => raw,
	});
}

function pills(wrapper: HTMLElement): HTMLElement[] {
	return Array.from(wrapper.querySelectorAll<HTMLElement>(".sf-cx-relpill"));
}

function markersFrom(wrapper: HTMLElement, from: HTMLElement): string[] {
	return [...walkTargetMarkers(from, wrapper, createMarkerKindOf(ANVIL_MARKERS)).markers];
}

describe("entryPills — link pills (native frontmatter backend)", () => {
	it("stamps the link target on a wikilink pill, keeping the visible text as stored", () => {
		const [pill] = pills(nativeWrapper(["[[Tobias Ferro]]"]));
		expect(pill?.getAttribute("data-sf-link")).toBe("Tobias Ferro");
		expect(pill?.textContent).toBe("[[Tobias Ferro]]");
	});

	it("strips alias and heading from the target", () => {
		const [a, b] = pills(nativeWrapper(["[[Tobias Ferro|Toby]]", "[[Moonharbor#History]]"]));
		expect(a?.getAttribute("data-sf-link")).toBe("Tobias Ferro");
		expect(b?.getAttribute("data-sf-link")).toBe("Moonharbor");
	});

	it("leaves a plain-text pill unmarked — never a marker that resolves to nothing", () => {
		const [pill] = pills(nativeWrapper(["shortblade"]));
		expect(pill?.hasAttribute("data-sf-link")).toBe(false);
	});

	it("marks only the link pills of a mixed list", () => {
		const marked = pills(nativeWrapper(["[[Elke Stoneway]]", "ember sight"])).map((p) =>
			p.getAttribute("data-sf-link"),
		);
		expect(marked).toEqual(["Elke Stoneway", null]);
	});
});

describe("entryPills — Bases backend (Value.toString display form)", () => {
	function basesWrapper(display: string): HTMLElement {
		const entry = basesCardEntry(
			{ file: { path: PATH }, getValue: () => ({ toString: (): string => display }) },
			{ allies: display },
		);
		return buildCardWrapper(entry, pillCard("allies"), { compact: false, resolveAsset: (r) => r });
	}

	it("stamps a pill whose display form still carries its brackets", () => {
		const marked = pills(basesWrapper("[[Tobias Ferro]], [[Elke Stoneway|Elke]]")).map((p) =>
			p.getAttribute("data-sf-link"),
		);
		expect(marked).toEqual(["Tobias Ferro", "Elke Stoneway"]);
	});

	it("leaves a bracket-less display form plain", () => {
		const [pill] = pills(basesWrapper("Tobias Ferro"));
		expect(pill?.hasAttribute("data-sf-link")).toBe(false);
	});
});

describe("entryPills — precedence against the card body (real walk)", () => {
	it("a link pill resolves to name, then card body — the pill wins", () => {
		const wrapper = nativeWrapper(["[[Tobias Ferro]]"]);
		expect(markersFrom(wrapper, pills(wrapper)[0]!)).toEqual(["name", "cardBody"]);
	});

	it("a plain pill falls through to the card body", () => {
		const wrapper = nativeWrapper(["shortblade"]);
		expect(markersFrom(wrapper, pills(wrapper)[0]!)).toEqual(["cardBody"]);
	});
});
