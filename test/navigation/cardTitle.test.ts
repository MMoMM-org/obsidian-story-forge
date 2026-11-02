/**
 * cardTitle — a Card's title opens the note in a new tab (setting-gated).
 *
 * The title carries `data-sf-link` AND `data-sf-card-title`. Hosts that list
 * the title attribute classify it as the `cardTitle` kind; nearest-marker
 * proximity is unchanged (no ranking special case). Precedence is asserted
 * through the REAL `walkTargetMarkers` on markup from the REAL `buildCardWrapper`.
 */

import { describe, expect, it } from "vitest";
import "../__mocks__/obsidian";
import { nativeCardEntry, type CardEntry, type CardRenderer } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { buildCardWrapper } from "codex/cardWrapper";
import { entryPills } from "codex/cards/shared";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import {
	ANVIL_MARKERS,
	CARD_BASES_MARKERS,
	SIDEBAR_MARKERS,
	createMarkerKindOf,
} from "navigation/markerVocabulary";
import { createNavigationController, resolveNavigationOutcome } from "navigation/navigationController";
import { DEFAULT_SETTINGS, normalizeSettings } from "types/index";

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";

const card: CardRenderer = {
	id: "t",
	label: "T",
	render(entry: CardEntry, el, deps): void {
		el.appendChild(deps.nameEl(entry));
		for (const p of entryPills(entry, "allies")) el.appendChild(p);
	},
};

function wrapper(): HTMLElement {
	return buildCardWrapper(nativeCardEntry(PATH, { allies: ["[[Tobias Ferro]]"] }), card, {
		compact: false,
		resolveAsset: (r) => r,
		tileField: nativeTileField,
	});
}

function kindsFrom(w: HTMLElement, from: Element, markers: readonly string[]): readonly string[] {
	return walkTargetMarkers(from as HTMLElement, w, createMarkerKindOf(markers)).markers;
}

describe("card title classification (real walk, real wrapper)", () => {
	it("Anvil: title -> cardTitle first, then cardBody", () => {
		const w = wrapper();
		expect(kindsFrom(w, w.querySelector(".sf-cx-name")!, ANVIL_MARKERS)).toEqual(["cardTitle", "cardBody"]);
	});

	it("Anvil: a relation pill is still a plain name (linkClickAction), not a title", () => {
		const w = wrapper();
		expect(kindsFrom(w, w.querySelector(".sf-cx-relpill")!, ANVIL_MARKERS)[0]).toBe("name");
	});

	it("Anvil: the card body away from title and pills is cardBody", () => {
		const w = wrapper();
		expect(kindsFrom(w, w, ANVIL_MARKERS)).toEqual(["cardBody"]);
	});

	it("standalone .base and Workbench lists do not recognise the title attribute: title stays a name", () => {
		const w = wrapper();
		const title = w.querySelector(".sf-cx-name")!;
		expect(kindsFrom(w, title, CARD_BASES_MARKERS)[0]).toBe("name");
		expect(kindsFrom(w, title, SIDEBAR_MARKERS)[0]).toBe("name");
	});
});

describe("resolveNavigationOutcome: cardTitle", () => {
	it.each([
		[false, true, "openNoteInTab"],
		[true, true, "inspect"],
		[false, false, "inspect"],
		[true, false, "openNoteInTab"],
	] as const)("modifier=%s setting=%s -> %s", (modifier, setting, action) => {
		expect(resolveNavigationOutcome("cardTitle", modifier, "drill", setting).action).toBe(action);
	});

	it("ignores linkClickAction", () => {
		expect(resolveNavigationOutcome("cardTitle", false, "open", true).action).toBe("openNoteInTab");
		expect(resolveNavigationOutcome("cardTitle", false, "drill", false).action).toBe("inspect");
	});

	it("the controller reads the setting per click and inspects when it is off", () => {
		let on = true;
		let inspected = 0;
		const c = createNavigationController({
			getLinkClickAction: () => "drill",
			getCardTitleOpensNote: () => on,
			inspect: () => { inspected++; },
		});
		expect(c.handle(["cardTitle", "cardBody"], false).action).toBe("openNoteInTab");
		expect(inspected).toBe(0);
		on = false;
		expect(c.handle(["cardTitle", "cardBody"], false).action).toBe("inspect");
		expect(inspected).toBe(1);
	});
});

describe("cardTitleOpensNote setting", () => {
	it("defaults to true", () => expect(DEFAULT_SETTINGS.cardTitleOpensNote).toBe(true));

	it.each([[false, false], [true, true], ["no", true], [0, true], [null, true], [undefined, true]])(
		"normalizes %s -> %s (fails closed to default)",
		(raw, expected) => {
			expect(normalizeSettings({ cardTitleOpensNote: raw }).cardTitleOpensNote).toBe(expected);
		},
	);
});
