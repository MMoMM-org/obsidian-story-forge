/**
 * cardWrapper equivalence tests — the extraction of the shared card-wrapper
 * builder (`codex/cardWrapper.ts`) out of `codexTab.ts`'s native `renderEntry`
 * and `CardBasesView.ts`'s Bases `renderEntry`.
 *
 * The two call sites used to hand-roll the SAME wrapper markup independently
 * — the `sf-cx-card` class, the card-body marker (`data-sf-card-body`),
 * `role="button"`, `tabindex="0"`, the `CardRenderDeps` assembly (in
 * particular `nameEl`), and `aria-label`. Two independent implementations of
 * one piece of markup is exactly what silently diverges. This file proves
 * both call sites — exercised through their REAL public entry points
 * (`renderCodexTab` and `CardBasesView.onDataUpdated`, not `buildCardWrapper`
 * called directly) — produce equivalent, in fact byte-identical, wrapper
 * markup for the same entry. That equivalence is the whole point of the
 * extraction, not an incidental unit-test of the helper in isolation.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, ADR-30, CON-6
 */

import { describe, it, expect, vi } from "vitest";
import { App, TFile, QueryController, BasesEntry, BasesQueryResult } from "../__mocks__/obsidian";
import { renderCodexTab, CodexSelectionStore, BUILT_IN_COLLECTIONS } from "codex/codexTab";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { nativeTileField } from "codex/cardTileField";
import { createCardRegistry, type CardEntry, type CardRenderer } from "codex/cardRegistry";
import { CardBasesView, type CardBasesViewDeps } from "bases/CardBasesView";

// ---------------------------------------------------------------------------
// A single fake Card, shared by both paths. It only reads `nameEl` and one
// scalar field — everything a minimal Card needs — so the only thing that can
// differ between the two renders is the WRAPPER each backend builds around it.
// ---------------------------------------------------------------------------

function makeFakeCard(id: string): CardRenderer {
	return {
		id,
		label: id,
		render(entry: CardEntry, el: HTMLElement, deps): void {
			el.appendChild(deps.nameEl(entry));
			const role = document.createElement("span");
			role.className = "role";
			role.textContent = entry.field("role").text;
			el.appendChild(role);
		},
	};
}

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";
const FRONTMATTER = { role: "Scout" };

// A fresh id per render call — CODEX_CARD_REGISTRY is a module-level
// singleton with "first registration wins" (ADR-30), so reusing an id across
// calls within this file would silently resolve to a stale registration.
let fixtureCounter = 0;
function freshCardId(prefix: string): string {
	fixtureCounter += 1;
	return `${prefix}-${fixtureCounter}`;
}

// ---------------------------------------------------------------------------
// Render through the Codex (native) path — renderCodexTab, the real entry
// point AnvilView drives.
// ---------------------------------------------------------------------------

function renderThroughCodex(): HTMLElement {
	const cardId = freshCardId("test-wrapper-codex");
	CODEX_CARD_REGISTRY.register(makeFakeCard(cardId));

	const container = document.createElement("div");
	renderCodexTab(container, {
		collections: BUILT_IN_COLLECTIONS,
		selection: new CodexSelectionStore(),
		index: [{ path: PATH, tags: ["canon/character"] }],
		excludedFolders: [],
		tileField: nativeTileField,
		cardId,
		frontmatterFor: (path: string): Record<string, unknown> | null =>
			path === PATH ? FRONTMATTER : null,
	});

	const cardEl = container.querySelector<HTMLElement>("[data-sf-card-body]");
	if (!cardEl) throw new Error("no card rendered via the Codex path");
	return cardEl;
}

// ---------------------------------------------------------------------------
// Render through the Bases path — CardBasesView.onDataUpdated, the real entry
// point the Bases runtime drives.
// ---------------------------------------------------------------------------

function renderThroughBases(): HTMLElement {
	const cardId = freshCardId("test-wrapper-bases");

	const app = new App();
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
		{ frontmatter: FRONTMATTER } as ReturnType<typeof app.metadataCache.getFileCache>,
	);

	const registry = createCardRegistry(makeFakeCard(cardId));
	const container = document.createElement("div");
	const deps: CardBasesViewDeps = {
		app,
		registry,
		cardId,
		onEntryClick: (): void => {},
	};
	const view = new CardBasesView("story-forge-test", new QueryController(), container, deps);

	const entry = new BasesEntry();
	const file = new TFile();
	file.path = PATH;
	entry.file = file;
	entry.getValue.mockImplementation((propId: string) =>
		propId === "role" ? { toString: (): string => "Scout" } : null,
	);

	const result = new BasesQueryResult();
	result.data = [entry];
	view.data = result;
	view.onDataUpdated();

	const cardEl = container.querySelector<HTMLElement>("[data-sf-card-body]");
	if (!cardEl) throw new Error("no card rendered via the Bases path");
	return cardEl;
}

// ---------------------------------------------------------------------------
// Equivalence
// ---------------------------------------------------------------------------

describe("Card wrapper equivalence — Codex path vs Bases path", () => {
	it("produces byte-identical wrapper markup for the same entry", () => {
		const codexCard = renderThroughCodex();
		const basesCard = renderThroughBases();

		expect(basesCard.outerHTML).toBe(codexCard.outerHTML);
	});

	it.each([
		["Codex", renderThroughCodex],
		["Bases", renderThroughBases],
	])(
		"[%s] carries the shared wrapper structure: sf-cx-card, card-body marker, role, tabindex, aria-label, name nested inside",
		(_label, render) => {
			const cardEl = render();

			expect(cardEl.classList.contains("sf-cx-card")).toBe(true);
			expect(cardEl.getAttribute("data-sf-card-body")).toBe(PATH);
			expect(cardEl.getAttribute("role")).toBe("button");
			expect(cardEl.getAttribute("tabindex")).toBe("0");
			expect(cardEl.getAttribute("aria-label")).toBe("Mara Stoneway");

			// ADR-28: the name marker must nest INSIDE the card-body element, not
			// sit alongside it or replace it — the F2 precedence AC rests on this.
			const nameEl = cardEl.querySelector("[data-sf-link]");
			expect(nameEl).not.toBeNull();
			expect(cardEl.contains(nameEl)).toBe(true);
			expect(nameEl).not.toBe(cardEl);
			expect(nameEl?.classList.contains("sf-cx-name")).toBe(true);
			expect(nameEl?.getAttribute("data-sf-link")).toBe(PATH);
		},
	);
});
