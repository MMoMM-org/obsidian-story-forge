/**
 * CardBasesView.navigation.test.ts — F2 target-kind routing closure for the
 * standalone-`.base` surface (owned gap recorded at the Phase 4 close-out).
 *
 * Before this fix, `CardBasesView`'s delegated click listener collapsed
 * EVERY click on a card — name or body, modified or not — into one
 * unconditional `onEntryClick` (file-open). The identical markup rendered by
 * the Anvil's Codex tab already gets the full F2 matrix through
 * `NavigationController` (ADR-28): plain click → inspect, modifier click →
 * open-note, name-nested-in-card-body wins by DOM proximity. Now that
 * `buildCardWrapper` (`codex/cardWrapper.ts`) is the single producer of both
 * surfaces' markup, the markers were already there — only the *handling* was
 * missing.
 *
 * This closure is deliberately PARTIAL: "inspect" stays a no-op. A standalone
 * `.base` has no Anvil, no editor pane (Phase 5's T5.1, not landed), and no
 * tab to stay within — there is nowhere for an inspection to be shown. Only
 * "openNote" is enacted; a plain click on a card body must do nothing, which
 * is the assertion that proves inspect was not faked as a fallback file-open.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import { describe, it, expect, vi } from "vitest";
import { QueryController, BasesEntry, BasesQueryResult, App, TFile } from "../__mocks__/obsidian";
import { CardBasesView, type CardBasesViewDeps } from "bases/CardBasesView";
import { createCardRegistry, type CardEntry, type CardRegistry, type CardRenderer } from "codex/cardRegistry";
import type { LinkClickAction } from "navigation/navigationController";

// ---------------------------------------------------------------------------
// Fixtures (mirrors test/bases/CardBasesView.test.ts's local factories)
// ---------------------------------------------------------------------------

/**
 * Renders the shared `nameEl` (carrying `data-sf-link`, nested INSIDE the
 * `buildCardWrapper` wrapper that already carries `data-sf-card-body`) plus a
 * second, un-marked span — somewhere in the card body that is NOT the name —
 * so a test can click "the body but not the name" distinctly from "the name".
 */
function makeFakeCard(id: string): CardRenderer {
	return {
		id,
		label: id,
		render(entry: CardEntry, el: HTMLElement, deps): void {
			el.appendChild(deps.nameEl(entry));
			const bodyOnly = document.createElement("span");
			bodyOnly.setAttribute("data-testid", "body-only");
			bodyOnly.textContent = "some other card content, not the name";
			el.appendChild(bodyOnly);
		},
	};
}

function makeRegistry(): CardRegistry {
	return createCardRegistry(makeFakeCard("hero"));
}

function makeEntry(path: string): BasesEntry {
	const entry = new BasesEntry();
	const file = new TFile();
	file.path = path;
	entry.file = file;
	entry.getValue.mockImplementation(() => null);
	return entry;
}

function makeResult(entries: BasesEntry[]): BasesQueryResult {
	const result = new BasesQueryResult();
	result.data = entries;
	return result;
}

function makeView(overrides?: Partial<CardBasesViewDeps>): {
	view: CardBasesView;
	container: HTMLElement;
	app: App;
	onEntryClick: ReturnType<typeof vi.fn>;
} {
	const controller = new QueryController();
	const container = document.createElement("div");
	const app = new App();
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
		{ frontmatter: {} } as ReturnType<typeof app.metadataCache.getFileCache>,
	);
	const onEntryClick = vi.fn();
	const deps: CardBasesViewDeps = {
		app,
		registry: makeRegistry(),
		cardId: "hero",
		onEntryClick,
		...overrides,
	};
	const view = new CardBasesView("story-forge-hero", controller, container, deps);
	return { view, container, app, onEntryClick };
}

// ---------------------------------------------------------------------------
// open-note outcome (modifier click) vs. inert inspect (plain click)
// ---------------------------------------------------------------------------

describe("CardBasesView — F2 target-kind routing (ADR-28 closure)", () => {
	it("modifier-click on a card body opens the note", () => {
		const { view, container, onEntryClick } = makeView();
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		const cardEl = container.querySelector('[data-sf-card-body="Characters/Mara.md"]') as HTMLElement;
		expect(cardEl).not.toBeNull();
		cardEl.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));

		expect(onEntryClick).toHaveBeenCalledTimes(1);
		expect(onEntryClick).toHaveBeenCalledWith("Characters/Mara.md");

		document.body.removeChild(container);
	});

	it("plain click on a card body does nothing — inspect is inert on this surface (not faked as open)", () => {
		const { view, container, onEntryClick } = makeView();
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		const cardEl = container.querySelector('[data-sf-card-body="Characters/Mara.md"]') as HTMLElement;
		expect(cardEl).not.toBeNull();
		cardEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onEntryClick).not.toHaveBeenCalled();

		document.body.removeChild(container);
	});
});

// ---------------------------------------------------------------------------
// Name-over-card-body precedence — real walkTargetMarkers, real rendered DOM
// ---------------------------------------------------------------------------

describe("CardBasesView — inside a host that navigates for itself (the Anvil's embed)", () => {
	function nameClick(host: boolean): ReturnType<typeof vi.fn> {
		const { view, container, onEntryClick } = makeView({ getLinkClickAction: (): LinkClickAction => "open" });
		const wrap = document.createElement("div");
		if (host) wrap.setAttribute("data-sf-nav-host", "");
		wrap.appendChild(container);
		document.body.appendChild(wrap);
		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();
		container.querySelector('[data-sf-link="Characters/Mara.md"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		document.body.removeChild(wrap);
		return onEntryClick;
	}

	it("does not open the note itself: the host's handler does", () => {
		expect(nameClick(true)).not.toHaveBeenCalled();
	});

	it("a standalone .base still opens it through onEntryClick", () => {
		expect(nameClick(false)).toHaveBeenCalledWith("Characters/Mara.md");
	});
});

describe("CardBasesView — name wins over its surrounding card body (ADR-28 proximity)", () => {
	/**
	 * Under the default "drill" setting, a plain click on `name` and a plain
	 * click on `cardBody` resolve to the SAME action (both inert) — so a
	 * `getLinkClickAction: () => "open"` override is used here specifically to
	 * make the two markers' rules diverge (name: plain click ⇒ open under
	 * "open"; cardBody: plain click ⇒ always inert, ignoring the setting).
	 * That divergence is what makes "which marker actually won" observable
	 * through real click routing rather than only through an isolated,
	 * hand-built markers array — a nesting regression in the real rendered
	 * markup, or a reverted "always open" handler, both surface here.
	 */
	function makeOpenView(): ReturnType<typeof makeView> {
		return makeView({ getLinkClickAction: (): LinkClickAction => "open" });
	}

	it("a plain click on the card body (NOT the name) stays inert regardless of the configured setting", () => {
		const { view, container, onEntryClick } = makeOpenView();
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		const bodyOnly = container.querySelector('[data-testid="body-only"]') as HTMLElement;
		expect(bodyOnly).not.toBeNull();
		bodyOnly.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onEntryClick).not.toHaveBeenCalled();

		document.body.removeChild(container);
	});

	it("a plain click on the nested name element opens under the same setting — name wins by DOM proximity", () => {
		const { view, container, onEntryClick } = makeOpenView();
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md")]);
		view.onDataUpdated();

		const cardEl = container.querySelector('[data-sf-card-body="Characters/Mara.md"]') as HTMLElement;
		const nameEl = container.querySelector('[data-sf-link="Characters/Mara.md"]') as HTMLElement;
		expect(cardEl).not.toBeNull();
		expect(nameEl).not.toBeNull();
		// The nesting itself is load-bearing (buildCardWrapper's docstring) —
		// assert it directly so a flattening regression is visible here too.
		expect(nameEl).not.toBe(cardEl);
		expect(cardEl.contains(nameEl)).toBe(true);

		nameEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onEntryClick).toHaveBeenCalledTimes(1);
		expect(onEntryClick).toHaveBeenCalledWith("Characters/Mara.md");

		document.body.removeChild(container);
	});
});
