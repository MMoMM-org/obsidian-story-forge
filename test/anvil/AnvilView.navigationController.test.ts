/**
 * AnvilView.navigationController.test.ts — T2.5 (spec 008-codex-surface, Phase 2).
 *
 * Wires AnvilView's click routing to the shared `NavigationController`
 * (ADR-28) and fixes the reported regression: a click in the Anvil used to
 * call `revealAndShowFile`, which opened/revealed the Workbench leaf. Per
 * PRD/F2's AC, "inspect" in the Anvil must show the entry within the Anvil
 * and must not open, reveal or re-target any other leaf — until the Anvil's
 * own editor pane exists (Phase 4/5), there is nowhere to show an inspection,
 * so the default `_drill` deliberately does nothing (AnvilView.ts).
 *
 * Also covers the one genuine DOM-nesting case in the whole codebase
 * (navigationController.ts's docstring, AnvilView._onClick's own comment):
 * the timeline act label carries `data-sf-link` *inside* its section
 * header's `data-sf-section-toggle` (renderTimeline.ts renderRail). Nearest-
 * first marker collection must resolve the label to "name" (drills) and the
 * chevron/rest of the header to "structuralControl" (collapses only).
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";

// ---- mini scene-vault, with a shared beat note for act 1 -------------------
const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const dying = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const beat = createMockTFile({ basename: "The Warden's Call", path: "20 Planning/Beats/The Warden's Call.md" });
const s1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const s2 = createMockTFile({ basename: "Scene 2", path: "10 Manuscript/WoM/Scene 2.md" });

function tag(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}
function sceneCache(act: number, order: number): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act, order, status: "draft", when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", "The Dying Light"),
			createMockFrontmatterLink("beat", "The Warden's Call"),
		],
	});
}

function content(view: AnvilView): HTMLElement {
	return view.contentEl;
}
function bodyOf(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}
function click(el: Element | null, opts: { ctrl?: boolean } = {}): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: opts.ctrl ?? false }));
}

/** Build the shared vault fixture into `app`'s mocked App/vault/metadataCache. */
function seedVault(app: App): void {
	const caches = new Map<TFile, CachedMetadata>([
		[book, tag("#planning/book")],
		[dying, tag("#planning/plotline")],
		[beat, createMockCachedMetadata({ frontmatter: { title: "The Warden's Call" } })],
		[s1, sceneCache(1, 1)],
		[s2, sceneCache(1, 2)],
	]);
	const byPath = new Map<string, TFile>([book, dying, beat, s1, s2].map((f) => [f.path, f]));
	const byLink = new Map<string, TFile>([
		["Wardens of Moonharbor", book],
		["The Dying Light", dying],
		["The Warden's Call", beat],
	]);

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, dying, beat, s1, s2]);
	app.metadataCache.resolvedLinks = {
		"10 Manuscript/WoM/Scene 1.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
		"10 Manuscript/WoM/Scene 2.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
	};
	app.workspace.getActiveFile = vi.fn(() => book);
	app.workspace.openLinkText = vi.fn(async () => {});
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return leaf;
}

// ---------------------------------------------------------------------------
// Regression: inspect in the Anvil must not touch any other leaf.
// ---------------------------------------------------------------------------

describe("AnvilView: inspect targets the Anvil's own body, never another leaf", () => {
	let app: App;
	let view: AnvilView;

	beforeEach(async () => {
		app = new App();
		seedVault(app);
		// No `drill` injected — exercises the real production default, which is
		// exactly what regressed (it used to call revealAndShowFile).
		view = new AnvilView(makeLeaf(app), { getLinkClickAction: () => "drill" });
		await view.onOpen();
	});

	it("a click in the Anvil no longer hijacks the Workbench [PRD/F2]", () => {
		click(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`));

		// No sidebar leaf was revealed, created, or targeted.
		expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
		expect(app.workspace.getLeavesOfType).not.toHaveBeenCalled();
	});

	it("inspect does not open the note in the workspace either (it only inspects)", () => {
		click(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`));
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("still routes through the injectable inspect hook (drill) when one is supplied", async () => {
		const drill = vi.fn();
		const injected = new AnvilView(makeLeaf(app), { getLinkClickAction: () => "drill", drill });
		await injected.onOpen();

		click(bodyOf(injected).querySelector(`[data-sf-link="${s1.path}"]`));

		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(s1.path);
		expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// open-note changes no panel's selected tab [PRD/F2 AC]
// ---------------------------------------------------------------------------

describe("AnvilView: open-note changes no panel's selected tab", () => {
	let app: App;
	let view: AnvilView;
	let drill: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		app = new App();
		seedVault(app);
		drill = vi.fn();
		view = new AnvilView(makeLeaf(app), { getLinkClickAction: () => "drill", drill });
		await view.onOpen();
	});

	it("modifier-click opens the note and leaves the Anvil's own layout tab unchanged", () => {
		const before = (view as unknown as { _layout: string })._layout;

		click(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`), { ctrl: true });

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(s1.path, "", false);
		expect(drill).not.toHaveBeenCalled();
		expect((view as unknown as { _layout: string })._layout).toBe(before);
		// And still no leaf reveal/hijack of the Workbench.
		expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Regression guard: the nesting case (ADR-28 / navigationController.ts docstring)
// ---------------------------------------------------------------------------

describe("AnvilView: timeline act label drills, its section chevron collapses", () => {
	let app: App;
	let view: AnvilView;
	let drill: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		app = new App();
		seedVault(app);
		drill = vi.fn();
		view = new AnvilView(makeLeaf(app), { getLinkClickAction: () => "drill", drill });
		await view.onOpen();
	});

	function actHead(): HTMLElement {
		const head = bodyOf(view).querySelector(".sf-tl-acthead") as HTMLElement | null;
		if (!head) throw new Error("no act header rendered");
		return head;
	}

	it("the act header carries both data-sf-section-toggle and a nested data-sf-link label", () => {
		const head = actHead();
		expect(head.hasAttribute("data-sf-section-toggle")).toBe(true);
		const label = head.querySelector(".sf-sec-label");
		expect(label?.getAttribute("data-sf-link")).toBe(beat.path);
	});

	it("clicking the act label drills to the shared beat note (name wins by proximity)", () => {
		const label = actHead().querySelector(".sf-sec-label");
		click(label);

		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(beat.path);
	});

	it("clicking the chevron only collapses the section (drill is never called)", () => {
		const chev = actHead().querySelector(".sf-sec-chev");

		click(chev);

		// _render() rebuilds the body on collapse — re-query rather than hold a
		// stale reference to the pre-render element.
		expect(drill).not.toHaveBeenCalled();
		const sectionBody = actHead().closest(".sf-section")?.querySelector(".sf-sec-body");
		expect(sectionBody?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});

	it("clicking the rest of the header (not the label) also only collapses, never drills", () => {
		// The header element itself, not any of its children.
		click(actHead());

		expect(drill).not.toHaveBeenCalled();
		const sectionBody = actHead().closest(".sf-section")?.querySelector(".sf-sec-body");
		expect(sectionBody?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Repo invariant: unknown target → no action, no write.
// ---------------------------------------------------------------------------

describe("AnvilView: a click with no known target kind takes no action", () => {
	let app: App;
	let view: AnvilView;
	let drill: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		app = new App();
		seedVault(app);
		drill = vi.fn();
		view = new AnvilView(makeLeaf(app), { getLinkClickAction: () => "drill", drill });
		await view.onOpen();
	});

	it("clicking the brand label (no marker attributes) does nothing", () => {
		const brand = content(view).querySelector(".sf-ws-brand");
		const layoutBefore = (view as unknown as { _layout: string })._layout;

		click(brand);

		expect(drill).not.toHaveBeenCalled();
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		expect((view as unknown as { _layout: string })._layout).toBe(layoutBefore);
	});
});
