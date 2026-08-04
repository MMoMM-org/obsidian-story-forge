/**
 * CardBasesView tests — T4.5 (spec 008-codex-surface, Phase 4).
 *
 * CardBasesView is the OTHER half of ADR-30 (one CardRenderer, two backends):
 * it draws Bases entries through the same Card contract (heroCard/tableCard/
 * compactCard use) the native Codex tab draws with — registered as its own
 * Bases view type per Card (hero/table/compact) so a Card is selectable
 * directly inside a user's own `.base` file.
 *
 * Contracts verified:
 *   - onDataUpdated() reads this.data FRESH each call (ADR-2, no BasesEntry caching)
 *   - onDataUpdated() empties the container before repainting (CON-4)
 *   - the Card is resolved from the registry AT DRAW TIME, never captured at
 *     construction — a registry whose resolution changes between construction
 *     and a later onDataUpdated must be reflected on the next render
 *   - a blank-but-present property renders normally (not `.miss`), while a
 *     truly absent one is marked — the T4.5 GATE (blank-vs-absent parity)
 *   - teardown unregisters cleanly: onDataUpdated is inert after unload(), no leak
 *   - clicking an entry fires onEntryClick with its path
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.5, GATE callout
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-2, ADR-30
 */

import { describe, it, expect, vi } from "vitest";
import {
	QueryController,
	BasesEntry,
	BasesQueryResult,
	App,
	TFile,
} from "../__mocks__/obsidian";
import { CardBasesView, type CardBasesViewDeps } from "bases/CardBasesView";
import { createCardRegistry, type CardEntry, type CardRegistry, type CardRenderer } from "codex/cardRegistry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Reads a name, one scalar field ("role") — everything a minimal Card needs. */
function makeFakeCard(id: string): CardRenderer {
	return {
		id,
		label: id,
		render(entry: CardEntry, el: HTMLElement, deps): void {
			el.appendChild(deps.nameEl(entry));

			const role = document.createElement("span");
			role.className = "role";
			const field = entry.field("role");
			role.textContent = field.text;
			role.setAttribute("data-present", String(field.present));
			el.appendChild(role);
		},
	};
}

function makeRegistry(defaultCard: CardRenderer = makeFakeCard("hero")): CardRegistry {
	return createCardRegistry(defaultCard);
}

function makeController(): QueryController {
	return new QueryController();
}

function makeEntry(path: string, opts: {
	value?: string | null;
	frontmatter?: Record<string, unknown> | null;
} = {}): BasesEntry {
	const entry = new BasesEntry();
	const file = new TFile();
	file.path = path;
	entry.file = file;
	const value = opts.value ?? null;
	entry.getValue.mockImplementation((_propId: string): unknown =>
		value == null ? null : { toString: () => value },
	);
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
	const controller = makeController();
	const container = document.createElement("div");
	const app = new App();
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

/** Stub app.metadataCache.getFileCache to return `frontmatter` for every file. */
function stubFrontmatter(app: App, frontmatter: Record<string, unknown> | null): void {
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
		frontmatter == null ? null : ({ frontmatter } as ReturnType<typeof app.metadataCache.getFileCache>),
	);
}

// ---------------------------------------------------------------------------
// Fresh-read (no BasesEntry caching) — ADR-2
// ---------------------------------------------------------------------------

describe("CardBasesView — no BasesEntry caching (ADR-2)", () => {
	it("reads this.data fresh on each onDataUpdated call", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });

		view.data = makeResult([makeEntry("Characters/Mara.md", { value: "Scout" })]);
		view.onDataUpdated();
		expect(container.querySelector("[data-sf-card-body='Characters/Mara.md']")).not.toBeNull();

		view.data = makeResult([makeEntry("Characters/Kael.md", { value: "Antagonist" })]);
		view.onDataUpdated();

		expect(container.querySelector("[data-sf-card-body='Characters/Mara.md']")).toBeNull();
		expect(container.querySelector("[data-sf-card-body='Characters/Kael.md']")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// CON-4: empty before repaint
// ---------------------------------------------------------------------------

describe("CardBasesView — empty before repaint (CON-4)", () => {
	it("empties the container before each repaint", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });

		view.data = makeResult([makeEntry("a.md", { value: "Scout" })]);
		view.onDataUpdated();
		expect(container.querySelectorAll("[data-sf-card-body]")).toHaveLength(1);

		const sentinel = document.createElement("span");
		sentinel.setAttribute("data-sentinel", "yes");
		container.appendChild(sentinel);

		view.data = makeResult([makeEntry("b.md"), makeEntry("c.md")]);
		view.onDataUpdated();

		expect(container.querySelector("[data-sentinel]")).toBeNull();
		expect(container.querySelectorAll("[data-sf-card-body]")).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Resolve-at-draw-time, never captured (T4.2 consequence, T4.5 must honour)
// ---------------------------------------------------------------------------

describe("CardBasesView — resolves the Card from the registry at DRAW time", () => {
	it("reflects a later registry.resolve() result on the NEXT render, not a captured reference", () => {
		const registry = makeRegistry(makeFakeCard("hero"));
		const { view, container } = makeView({ registry, cardId: "hero" });

		view.data = makeResult([makeEntry("a.md")]);
		view.onDataUpdated();
		expect(container.querySelector(".role")).not.toBeNull();

		// Swap what resolve("hero") returns AFTER construction — a captured
		// CardRenderer reference (grabbed once at registerBasesView time) would
		// never see this; resolving fresh in onDataUpdated must.
		const spyCard: CardRenderer = {
			id: "hero",
			label: "hero",
			render(_entry, el): void {
				el.classList.add("sf-swapped-card");
			},
		};
		vi.spyOn(registry, "resolve").mockReturnValue(spyCard);

		view.data = makeResult([makeEntry("b.md")]);
		view.onDataUpdated();

		expect(container.querySelector(".sf-swapped-card")).not.toBeNull();
		expect(registry.resolve).toHaveBeenCalledWith("hero");
	});

	it("calls registry.resolve() again on every onDataUpdated (not memoized)", () => {
		const registry = makeRegistry();
		const resolveSpy = vi.spyOn(registry, "resolve");
		const { view } = makeView({ registry, cardId: "hero" });

		view.data = makeResult([makeEntry("a.md")]);
		view.onDataUpdated();
		view.data = makeResult([makeEntry("b.md")]);
		view.onDataUpdated();
		view.data = makeResult([]);
		view.onDataUpdated();

		expect(resolveSpy).toHaveBeenCalledTimes(3);
	});
});

// ---------------------------------------------------------------------------
// T4.5 GATE: blank-vs-absent parity with the native backend
// ---------------------------------------------------------------------------

describe("CardBasesView — blank-vs-absent parity (T4.5 GATE)", () => {
	it("renders a blank-but-present property as present, not marked absent", () => {
		const { view, container, app } = makeView();
		// getValue() returns null (Bases can't tell blank from absent alone), but
		// the frontmatter key IS present — the view must consult metadataCache.
		stubFrontmatter(app, { role: "" });

		view.data = makeResult([makeEntry("Characters/Mara.md", { value: null })]);
		view.onDataUpdated();

		const role = container.querySelector(".role");
		expect(role?.getAttribute("data-present")).toBe("true");
		expect(role?.textContent).toBe("");
	});

	it("marks a truly absent property as absent", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, {}); // no "role" key at all

		view.data = makeResult([makeEntry("Characters/Mara.md", { value: null })]);
		view.onDataUpdated();

		expect(container.querySelector(".role")?.getAttribute("data-present")).toBe("false");
	});

	it("treats a note with no frontmatter cache entry as every field absent", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, null);

		view.data = makeResult([makeEntry("Characters/Mara.md", { value: "Scout" })]);
		view.onDataUpdated();

		expect(container.querySelector(".role")?.getAttribute("data-present")).toBe("false");
	});
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("CardBasesView — empty state", () => {
	it("renders an empty-state marker when data.data is empty", () => {
		const { view, container } = makeView();

		view.data = makeResult([]);
		view.onDataUpdated();

		expect(container.querySelector("[data-empty-state]")).not.toBeNull();
	});

	it("does not render an empty-state marker when entries are present", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });

		view.data = makeResult([makeEntry("a.md", { value: "Scout" })]);
		view.onDataUpdated();

		expect(container.querySelector("[data-empty-state]")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Click delegation
// ---------------------------------------------------------------------------

describe("CardBasesView — onEntryClick", () => {
	it("fires onEntryClick with the entry's path when its card is clicked", () => {
		const { view, container, onEntryClick, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("Characters/Mara.md", { value: "Scout" })]);
		view.onDataUpdated();

		const cardEl = container.querySelector("[data-sf-card-body='Characters/Mara.md']") as HTMLElement;
		expect(cardEl).not.toBeNull();
		cardEl.click();

		expect(onEntryClick).toHaveBeenCalledTimes(1);
		expect(onEntryClick).toHaveBeenCalledWith("Characters/Mara.md");

		document.body.removeChild(container);
	});

	it("does not fire onEntryClick for a click outside any card", () => {
		const { view, container, onEntryClick, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });
		document.body.appendChild(container);

		view.data = makeResult([makeEntry("a.md", { value: "Scout" })]);
		view.onDataUpdated();

		container.click();

		expect(onEntryClick).not.toHaveBeenCalled();

		document.body.removeChild(container);
	});
});

// ---------------------------------------------------------------------------
// Teardown — no retained entries, inert after unload (CON-4)
// ---------------------------------------------------------------------------

describe("CardBasesView — teardown leaves no retained entries (CON-4)", () => {
	it("unload() calls the component teardown without throwing", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });

		view.data = makeResult([makeEntry("a.md", { value: "Scout" })]);
		view.onDataUpdated();
		expect(container.querySelectorAll("[data-sf-card-body]")).toHaveLength(1);

		expect(() => view.unload()).not.toThrow();
	});

	it("onDataUpdated() is inert after unload() — no stale bleed, no new content", () => {
		const { view, container, app } = makeView();
		stubFrontmatter(app, { role: "Scout" });

		view.data = makeResult([makeEntry("pre-unload.md", { value: "Scout" })]);
		view.onDataUpdated();
		expect(container.querySelector("[data-sf-card-body='pre-unload.md']")).not.toBeNull();

		view.unload();

		view.data = makeResult([makeEntry("post-unload.md", { value: "Scout" })]);
		view.onDataUpdated();

		// Pre-unload content is preserved (no repaint at all after unload); either
		// way the post-unload entry must never appear.
		expect(container.querySelector("[data-sf-card-body='post-unload.md']")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// type discriminant
// ---------------------------------------------------------------------------

describe("CardBasesView — view type discriminant", () => {
	it("exposes the viewId passed to its constructor as `type`", () => {
		const { view } = makeView();
		expect(view.type).toBe("story-forge-hero");
	});
});
