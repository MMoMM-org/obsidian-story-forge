/**
 * T5.3 — Integration & ground-truth validation for the contextual panel.
 *
 * Tests-as-implementation for spec 004-contextual-panel Phase 5. Drives the
 * REAL follow→resolve→render pipeline end-to-end against the seed vault's
 * frontmatter (Wardens of Moonharbor), asserting on the rendered DOM.
 *
 * Pipeline exercised (no production code is expected to change):
 *   SidebarView follow (active-leaf-change)
 *     → ScopingService.resolve + reverseIndex.buildBacklinks (backlinks)
 *     → NativeScopingEngine.render
 *     → per-kind renderer (src/panel/renderers/*)
 *     → shared components (.sf-section / .sf-lrow / .sf-unres / emptyLine).
 *
 * Seed fixtures: the metadataCache is built from the KNOWN frontmatter of the
 * seed notes under test/StoryForge/** (the same strategy the scoping unit tests
 * use — no live vault, no file reads). `buildFixtureCache` ingests a set of
 * NoteSpecs (frontmatter + tag + frontmatterLinks) and wires getFileCache,
 * getFirstLinkpathDest, getAbstractFileByPath, and resolvedLinks so backlinks
 * resolve exactly as they would in Obsidian.
 *
 * Ground-truth assertions (PRD/Success Metrics — Correctness):
 *   1. Mara appears-in = Scene 1/2/3 (POV), basename-ordered.
 *   2. Tobias owns The Beacon Lens.
 *   3. Moonharbor Lighthouse inhabitants = Tobias + Mara.
 *   4. The Dying Light scenes = Scene 1/2/3 in rendered order.
 *   5. Lyra Tidecall (fantasy) renders the Fantasy sub-block.
 *
 * @ref PRD/Success Metrics — Key Verification Signals (Correctness/Robustness)
 * @ref SDD/Quality Requirements
 * @ref plan/phase-5.md T5.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	App,
	WorkspaceLeaf,
	TFile,
	createMockTFile,
	createMockFrontmatterLink,
	type CachedMetadata,
	type FrontmatterLinkCache,
} from "../__mocks__/obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { ScopingService } from "scoping/ScopingService";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import { makeDummyViewRecord } from "../helpers/viewFixtures";

// ---------------------------------------------------------------------------
// Fixture model — build a metadataCache from the seed notes' known frontmatter
// ---------------------------------------------------------------------------

/**
 * A single seed note: its vault path, classifier tag, raw frontmatter, and the
 * frontmatter wikilinks (key → target basename) that ScopingService reads.
 */
interface NoteSpec {
	path: string;
	basename: string;
	/** Classifier tag, e.g. "#canon/character". */
	tag: string;
	frontmatter: Record<string, unknown>;
	/** [frontmatterKey, targetBasename] pairs — e.g. ["pov", "Mara Stoneway"]. */
	links: Array<[string, string]>;
}

interface Fixture {
	app: App;
	/** basename → TFile. */
	files: Map<string, TFile>;
	fileByPath: Map<string, TFile>;
}

/**
 * Ingest a set of NoteSpecs into a fresh App's metadataCache + vault, mirroring
 * how Obsidian would expose them:
 *   - getFileCache(file) → { tags, frontmatter, frontmatterLinks }
 *   - getFirstLinkpathDest(basename) → the target TFile (basename-keyed)
 *   - getAbstractFileByPath(path) → the TFile (for reverseIndex)
 *   - resolvedLinks[srcPath][destPath] = n (derived from each note's links)
 */
function buildFixtureCache(specs: NoteSpec[]): Fixture {
	const app = new App();
	const files = new Map<string, TFile>();
	const fileByPath = new Map<string, TFile>();

	for (const spec of specs) {
		const file = createMockTFile({
			path: spec.path,
			basename: spec.basename,
			name: `${spec.basename}.md`,
		});
		files.set(spec.basename, file);
		fileByPath.set(spec.path, file);
	}

	const cacheBySpec = new Map<TFile, CachedMetadata>();
	const resolvedLinks: Record<string, Record<string, number>> = {};

	for (const spec of specs) {
		const file = files.get(spec.basename)!;
		const frontmatterLinks: FrontmatterLinkCache[] = spec.links.map(
			([key, target]) => createMockFrontmatterLink(key, target),
		);
		cacheBySpec.set(file, {
			tags: [{ tag: spec.tag }],
			frontmatter: spec.frontmatter,
			frontmatterLinks,
		});

		// Build resolvedLinks: srcPath → { destPath: count }
		const edges: Record<string, number> = {};
		for (const [, target] of spec.links) {
			const dest = files.get(target);
			if (!dest) continue; // unresolved link → no resolvedLinks edge
			edges[dest.path] = (edges[dest.path] ?? 0) + 1;
		}
		if (Object.keys(edges).length > 0) resolvedLinks[spec.path] = edges;
	}

	vi.mocked(app.metadataCache.getFileCache).mockImplementation(
		(f: TFile) => cacheBySpec.get(f) ?? null,
	);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(
		(link: string) => files.get(link) ?? null,
	);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(
		(p: string) => fileByPath.get(p) ?? null,
	);
	app.metadataCache.resolvedLinks = resolvedLinks;

	return { app, files, fileByPath };
}

// ---------------------------------------------------------------------------
// Seed notes — VERIFIED from test/StoryForge/** frontmatter (T5.3 ground truth)
// ---------------------------------------------------------------------------

const SCENE_1: NoteSpec = {
	path: "10 Manuscript/Wardens of Moonharbor/Scene 1 - The Extinguished Fire.md",
	basename: "Scene 1 - The Extinguished Fire",
	tag: "#manuscript/scene",
	frontmatter: { type: "scene", subtitle: "Mara finds the lens gone cold.", order: 1, status: "draft" },
	links: [
		["book", "Wardens of Moonharbor"],
		["pov", "Mara Stoneway"],
		["characters.0", "Mara Stoneway"],
		["characters.1", "Tobias Ferro"],
		["location", "Moonharbor Lighthouse"],
		["plotlines.0", "The Dying Light"],
		["next.0", "Scene 2 - The Salty Gull"],
	],
};

const SCENE_2: NoteSpec = {
	path: "10 Manuscript/Wardens of Moonharbor/Scene 2 - The Salty Gull.md",
	basename: "Scene 2 - The Salty Gull",
	tag: "#manuscript/scene",
	frontmatter: { type: "scene", subtitle: "A rumour points to the west cape.", order: 2, status: "draft" },
	links: [
		["book", "Wardens of Moonharbor"],
		["pov", "Mara Stoneway"],
		["characters.0", "Mara Stoneway"],
		["characters.1", "Jonas Kell"],
		["characters.2", "Elke Stoneway"],
		["location", "The Salty Gull"],
		["plotlines.0", "The Dying Light"],
		["prev.0", "Scene 1 - The Extinguished Fire"],
		["next.0", "Scene 3 - The Black Cliffs"],
	],
};

const SCENE_3: NoteSpec = {
	path: "10 Manuscript/Wardens of Moonharbor/Scene 3 - The Black Cliffs.md",
	basename: "Scene 3 - The Black Cliffs",
	tag: "#manuscript/scene",
	frontmatter: { type: "scene", subtitle: "Mara confronts the shadow trader.", order: 3, status: "outline" },
	links: [
		["book", "Wardens of Moonharbor"],
		["pov", "Mara Stoneway"],
		["characters.0", "Mara Stoneway"],
		["characters.1", "Tobias Ferro"],
		["characters.2", "Silvan Nightweaver"],
		["location", "The Black Cliffs"],
		["plotlines.0", "The Dying Light"],
		["prev.0", "Scene 2 - The Salty Gull"],
	],
};

const MARA: NoteSpec = {
	path: "30 Canon/31 Characters/Mara Stoneway.md",
	basename: "Mara Stoneway",
	tag: "#canon/character",
	frontmatter: {
		type: "character", name: "Mara Stoneway", role: "protagonist",
		status: "alive", occupation: "lighthouse apprentice", portrait: "",
	},
	links: [
		["significant_other.0", "Jonas Kell"],
		["family.0", "Elke Stoneway"],
		["friends.0", "Jonas Kell"],
		["allies.0", "Tobias Ferro"],
		["enemies.0", "Silvan Nightweaver"],
	],
};

const TOBIAS: NoteSpec = {
	path: "30 Canon/31 Characters/Tobias Ferro.md",
	basename: "Tobias Ferro",
	tag: "#canon/character",
	frontmatter: { type: "character", name: "Tobias Ferro", role: "deuteragonist", status: "alive", portrait: "" },
	links: [
		["friends.0", "Elke Stoneway"],
		["allies.0", "Mara Stoneway"],
		["enemies.0", "Silvan Nightweaver"],
	],
};

const LYRA: NoteSpec = {
	path: "30 Canon/31 Characters/Lyra Tidecall.md",
	basename: "Lyra Tidecall",
	tag: "#canon/character",
	frontmatter: {
		type: "character", name: "Lyra Tidecall", role: "supporting", status: "alive",
		portrait: "https://placehold.co/120x160/1a3a5c/c8dff5?text=Lyra+Tidecall",
		species: "Merfolk",
		magical_abilities: ["tide-shaping", "bioluminescent-pulse"],
		combat_skills: ["trident"],
		weapons: ["silver trident (retractable)"],
	},
	links: [
		["allies.0", "Mara Stoneway"],
		["enemies.0", "Silvan Nightweaver"],
	],
};

const LIGHTHOUSE: NoteSpec = {
	path: "30 Canon/32 Locations/Moonharbor Lighthouse.md",
	basename: "Moonharbor Lighthouse",
	tag: "#canon/location",
	frontmatter: { type: "location", name: "Moonharbor Lighthouse", locationType: "building", region: "harbour mole" },
	links: [
		["world", "Moonharbor"],
		["inhabitants.0", "Tobias Ferro"],
		["inhabitants.1", "Mara Stoneway"],
	],
};

const MOONHARBOR: NoteSpec = {
	path: "30 Canon/32 Locations/Moonharbor.md",
	basename: "Moonharbor",
	tag: "#canon/location",
	frontmatter: { type: "location", name: "Moonharbor", locationType: "area", region: "north coast", world: "" },
	links: [
		["inhabitants.0", "Mara Stoneway"],
		["inhabitants.1", "Tobias Ferro"],
	],
};

const BEACON_LENS: NoteSpec = {
	path: "30 Canon/33 Objects/The Beacon Lens.md",
	basename: "The Beacon Lens",
	tag: "#canon/object",
	frontmatter: { type: "object", name: "The Beacon Lens", kind: "artifact" },
	links: [["owner", "Tobias Ferro"]],
};

const MOONFIRE: NoteSpec = {
	path: "30 Canon/34 Lore/The Moonfire.md",
	basename: "The Moonfire",
	tag: "#canon/lore",
	frontmatter: { type: "lore", name: "The Moonfire", scope: "world rule" },
	links: [
		["related.0", "The Beacon Lens"],
		["related.1", "Moonharbor Lighthouse"],
	],
};

const DYING_LIGHT: NoteSpec = {
	path: "20 Planning/The Dying Light.md",
	basename: "The Dying Light",
	tag: "#planning/plotline",
	frontmatter: { type: "plotline", name: "The Dying Light", logline: "The lighthouse apprentice...", status: "active" },
	links: [],
};

const BOOK: NoteSpec = {
	path: "20 Planning/Wardens of Moonharbor.md",
	basename: "Wardens of Moonharbor",
	tag: "#planning/book",
	frontmatter: { type: "book", name: "Wardens of Moonharbor", author: "", order: 1, status: "drafting" },
	links: [],
};

/** The complete seed set — every note referenced by the ground-truth cases. */
const SEED_NOTES: NoteSpec[] = [
	SCENE_1, SCENE_2, SCENE_3,
	MARA, TOBIAS, LYRA,
	LIGHTHOUSE, MOONHARBOR,
	BEACON_LENS, MOONFIRE,
	DYING_LIGHT, BOOK,
];

// ---------------------------------------------------------------------------
// View harness — drive the real SidebarView follow→resolve→render pipeline
// ---------------------------------------------------------------------------

/** A registry whose get() always misses → native fallback path in _renderResolved. */
function makeRegistry(): EngineRegistry {
	return { get: vi.fn(() => undefined) } as unknown as EngineRegistry;
}


function makeGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "consented" })),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate;
}

/** The panel's own leaf (guarded out of follow). */
function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

/** A markdown editor leaf carrying `file` — the follow source. */
function makeMdLeaf(file: TFile): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	return leaf;
}

/** Follow uses a debounced active-leaf-change handler (DEBOUNCE_MS in the view). */
const DEBOUNCE_MS = 200;

interface Harness {
	app: App;
	view: SidebarView;
	fixture: Fixture;
	/**
	 * Simulate opening `file` in the editor (fires active-leaf-change), advances
	 * the follow debounce timer, then flushes the async native render microtask
	 * so the rendered DOM is present when the call returns.
	 */
	follow(file: TFile): Promise<void>;
	body(): HTMLElement;
}

/**
 * Build the follow() driver. Fires active-leaf-change through the mock workspace,
 * advances the debounce timer (fake timers must be enabled by the caller), then
 * yields the microtask queue so `void _renderResolved(...)` completes.
 */
function makeFollow(app: App, view: SidebarView) {
	return async (file: TFile): Promise<void> => {
		app.workspace._trigger("active-leaf-change", makeMdLeaf(file));
		vi.advanceTimersByTime(DEBOUNCE_MS + 1);
		// Flush the async native render (await points inside _renderResolved).
		await Promise.resolve();
		await Promise.resolve();
	};
}

async function mountPanel(specs: NoteSpec[] = SEED_NOTES): Promise<Harness> {
	const fixture = buildFixtureCache(specs);
	const { app } = fixture;
	const leaf = makeOwnLeaf(app);
	const native = new NativeScopingEngine(app);
	const view = new SidebarView(leaf, makeRegistry(), makeGate(), native);
	await view.onOpen();
	// T5.3: set a non-null currentRecord so _renderResolved takes the engine-missing
	// path (nativeEngine.render produces M3 section DOM). Without this, the !view
	// branch renders the Inspector-only unified detail — no M3 sections.
	(view as unknown as { currentRecord: ViewRecord | null }).currentRecord =
		makeDummyViewRecord();

	return {
		app,
		view,
		fixture,
		follow: makeFollow(app, view),
		body(): HTMLElement {
			return view.contentEl.querySelector(".sf-body") as HTMLElement;
		},
	};
}

// --- DOM query helpers ------------------------------------------------------

/** Return the `.sf-section` whose label matches `label`, or null. */
function sectionByLabel(root: HTMLElement, label: string): HTMLElement | null {
	const labels = Array.from(root.querySelectorAll<HTMLElement>(".sf-sec-label"));
	const match = labels.find((l) => l.textContent === label);
	return match ? (match.closest(".sf-section") as HTMLElement) : null;
}

/** The body region of the named section (children rendered inside). */
function sectionBody(root: HTMLElement, label: string): HTMLElement | null {
	const sec = sectionByLabel(root, label);
	return sec ? (sec.querySelector(".sf-sec-body") as HTMLElement) : null;
}

/** Ordered link-row link texts inside a section body. */
function linkTextsIn(root: HTMLElement, label: string): string[] {
	const body = sectionBody(root, label);
	if (!body) return [];
	return Array.from(body.querySelectorAll<HTMLElement>(".sf-lrow .sf-lrow-lnk")).map(
		(el) => el.textContent ?? "",
	);
}

// ===========================================================================
// 1. follow→resolve→render for ALL SIX KINDS
// ===========================================================================

describe("T5.3 pipeline — all six entity kinds render their kind-appropriate panel", () => {
	let h: Harness;

	beforeEach(async () => {
		vi.useFakeTimers();
		h = await mountPanel();
	});
	afterEach(async () => {
		await h.view.onClose();
		vi.useRealTimers();
	});

	it("character (Mara) → Relationships + Appears in sections render", async () => {
		await h.follow(h.fixture.files.get("Mara Stoneway")!);
		const body = h.body();
		expect(sectionByLabel(body, "Relationships")).not.toBeNull();
		expect(sectionByLabel(body, "Appears in")).not.toBeNull();
		expect(sectionByLabel(body, "Owns")).not.toBeNull();
	});

	it("location (Moonharbor Lighthouse) → Inhabitants + Scenes here sections render", async () => {
		await h.follow(h.fixture.files.get("Moonharbor Lighthouse")!);
		const body = h.body();
		expect(sectionByLabel(body, "Inhabitants")).not.toBeNull();
		expect(sectionByLabel(body, "Scenes here")).not.toBeNull();
	});

	it("object (The Beacon Lens) → Owner + Appears in sections render", async () => {
		await h.follow(h.fixture.files.get("The Beacon Lens")!);
		const body = h.body();
		expect(sectionByLabel(body, "Owner")).not.toBeNull();
		expect(sectionByLabel(body, "Appears in")).not.toBeNull();
	});

	it("lore (The Moonfire) → Related + Referenced by sections render", async () => {
		await h.follow(h.fixture.files.get("The Moonfire")!);
		const body = h.body();
		expect(sectionByLabel(body, "Related")).not.toBeNull();
		expect(sectionByLabel(body, "Referenced by")).not.toBeNull();
	});

	it("scene (Scene 1) → Point of view + Characters + Location + Plotlines sections render", async () => {
		await h.follow(h.fixture.files.get("Scene 1 - The Extinguished Fire")!);
		const body = h.body();
		expect(sectionByLabel(body, "Point of view")).not.toBeNull();
		expect(sectionByLabel(body, "Characters")).not.toBeNull();
		expect(sectionByLabel(body, "Location")).not.toBeNull();
		expect(sectionByLabel(body, "Plotlines")).not.toBeNull();
	});

	it("plotline (The Dying Light) → Scenes section renders", async () => {
		await h.follow(h.fixture.files.get("The Dying Light")!);
		const body = h.body();
		expect(sectionByLabel(body, "Scenes")).not.toBeNull();
	});

	it("book (Wardens of Moonharbor) → Scenes section renders", async () => {
		await h.follow(h.fixture.files.get("Wardens of Moonharbor")!);
		const body = h.body();
		expect(sectionByLabel(body, "Scenes")).not.toBeNull();
	});
});

// ===========================================================================
// 2. GROUND-TRUTH assertions (PRD Success Metrics — Correctness) on rendered DOM
// ===========================================================================

describe("T5.3 ground truth — rendered DOM matches the verified seed vault", () => {
	let h: Harness;

	beforeEach(async () => {
		vi.useFakeTimers();
		h = await mountPanel();
	});
	afterEach(async () => {
		await h.view.onClose();
		vi.useRealTimers();
	});

	it("GT1: Mara's 'Appears in' covers exactly Scene 1/2/3 in basename order", async () => {
		await h.follow(h.fixture.files.get("Mara Stoneway")!);
		const texts = linkTextsIn(h.body(), "Appears in");
		// renderAppearsIn dedupes per scene: Mara is BOTH pov and in `characters`
		// for every scene, but each scene renders exactly once (mockup S32). The
		// ground truth ("appears in = Scenes 1–3") is the distinct scene set.
		expect(texts).toEqual([
			"Scene 1 - The Extinguished Fire",
			"Scene 2 - The Salty Gull",
			"Scene 3 - The Black Cliffs",
		]);
	});

	it("GT1b: each of Mara's scenes renders exactly one row, pov-tagged (pov precedence)", async () => {
		await h.follow(h.fixture.files.get("Mara Stoneway")!);
		const body = sectionBody(h.body(), "Appears in")!;
		const tags = Array.from(body.querySelectorAll<HTMLElement>(".sf-lrow .sf-trail")).map(
			(el) => el.textContent,
		);
		// Mara is pov AND a listed character in all three scenes → deduped to one
		// pov-tagged row per scene (pov wins over char).
		expect(tags).toEqual(["pov", "pov", "pov"]);
	});

	it("GT2: Tobias's 'Owns' lists The Beacon Lens", async () => {
		await h.follow(h.fixture.files.get("Tobias Ferro")!);
		const texts = linkTextsIn(h.body(), "Owns");
		expect(texts).toEqual(["The Beacon Lens"]);
	});

	it("GT3: Moonharbor Lighthouse's 'Inhabitants' lists Tobias + Mara", async () => {
		await h.follow(h.fixture.files.get("Moonharbor Lighthouse")!);
		const texts = linkTextsIn(h.body(), "Inhabitants");
		expect(texts).toEqual(["Tobias Ferro", "Mara Stoneway"]);
	});

	it("GT4: The Dying Light's 'Scenes' lists Scene 1/2/3 in rendered order", async () => {
		await h.follow(h.fixture.files.get("The Dying Light")!);
		const texts = linkTextsIn(h.body(), "Scenes");
		expect(texts).toEqual([
			"Scene 1 - The Extinguished Fire",
			"Scene 2 - The Salty Gull",
			"Scene 3 - The Black Cliffs",
		]);
	});

	it("GT5: Lyra Tidecall (fantasy) renders the Fantasy sub-block with species/abilities", async () => {
		await h.follow(h.fixture.files.get("Lyra Tidecall")!);
		const fantasy = sectionBody(h.body(), "Fantasy");
		expect(fantasy).not.toBeNull();
		const text = fantasy!.textContent ?? "";
		expect(text).toContain("species");
		expect(text).toContain("Merfolk");
		// magical_abilities is humanized to "magic" in the Fantasy block (fix #4).
		expect(text).toContain("magic");
	});

	it("GT5b: a non-fantasy character (Tobias) does NOT render a Fantasy sub-block", async () => {
		await h.follow(h.fixture.files.get("Tobias Ferro")!);
		expect(sectionByLabel(h.body(), "Fantasy")).toBeNull();
	});

	it("GT-object: The Beacon Lens 'Owner' link points at Tobias Ferro", async () => {
		await h.follow(h.fixture.files.get("The Beacon Lens")!);
		const texts = linkTextsIn(h.body(), "Owner");
		expect(texts).toEqual(["Tobias Ferro"]);
	});
});

// ===========================================================================
// 3. NAVIGATION end-to-end against real seed data (drill / open / swap)
// ===========================================================================

describe("T5.3 navigation — drill / open / swap on the integrated pipeline", () => {
	let clickAction: "drill" | "open";
	let h: Harness;
	let view: SidebarView;
	let app: App;

	async function mountWithAction(): Promise<void> {
		const fixture = buildFixtureCache(SEED_NOTES);
		app = fixture.app;
		const leaf = makeOwnLeaf(app);
		const native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => clickAction);
		await view.onOpen();
		// T5.3: set a non-null currentRecord so _renderResolved takes the engine-missing
		// path (nativeEngine.render produces M3 section DOM with data-sf-link rows).
		(view as unknown as { currentRecord: ViewRecord | null }).currentRecord =
			makeDummyViewRecord();
		h = {
			app,
			view,
			fixture,
			follow: makeFollow(app, view),
			body(): HTMLElement {
				return view.contentEl.querySelector(".sf-body") as HTMLElement;
			},
		};
	}

	beforeEach(async () => {
		vi.useFakeTimers();
		clickAction = "drill";
		await mountWithAction();
	});
	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	function priv() {
		return view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
	}

	/** Click a rendered link row carrying `data-sf-link`; flush the async re-render. */
	async function clickLink(path: string, opts: { meta?: boolean } = {}): Promise<void> {
		const el = h.body().querySelector(`[data-sf-link="${path}"]`) as HTMLElement | null;
		if (!el) throw new Error(`no rendered link for ${path}`);
		el.dispatchEvent(
			new MouseEvent("click", { bubbles: true, metaKey: opts.meta ?? false }),
		);
		// Drill re-renders via the async _renderResolved path.
		await Promise.resolve();
		await Promise.resolve();
	}

	/**
	 * Click a nav-chrome control and flush the async re-render. Back lives in the
	 * header (.sf-chead); the Open-note footer lives in the body — search the whole
	 * contentEl so both resolve.
	 */
	async function clickNav(sel: string): Promise<void> {
		const el = view.contentEl.querySelector(sel) as HTMLElement | null;
		if (!el) throw new Error(`no nav control for ${sel}`);
		el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
	}

	it("default click drills from a scene into its POV character (re-subjects + pushes stack)", async () => {
		const scene = h.fixture.files.get("Scene 1 - The Extinguished Fire")!;
		const mara = h.fixture.files.get("Mara Stoneway")!;
		await h.follow(scene);

		await clickLink(mara.path);

		expect(priv().subject.file?.path).toBe(mara.path);
		expect(priv().subject.source).toBe("drilled");
		expect(priv().navStack.map((f) => f.path)).toEqual([scene.path]);
		// The panel re-rendered as Mara's character sheet.
		expect(sectionByLabel(h.body(), "Relationships")).not.toBeNull();
	});

	it("drilled panel shows a Back affordance; Back pops the stack and resumes follow", async () => {
		const scene = h.fixture.files.get("Scene 1 - The Extinguished Fire")!;
		const mara = h.fixture.files.get("Mara Stoneway")!;
		await h.follow(scene);
		await clickLink(mara.path);

		const back = view.contentEl.querySelector('.sf-chead [data-sf-nav="back"]') as HTMLElement | null;
		expect(back).not.toBeNull();
		await clickNav('.sf-chead [data-sf-nav="back"]');

		expect(priv().subject.file?.path).toBe(scene.path);
		expect(priv().navStack.length).toBe(0);
		expect(priv().subject.source).toBe("follow");
	});

	it("modifier click opens the note (openLinkText), clears the stack, resumes follow", async () => {
		const scene = h.fixture.files.get("Scene 1 - The Extinguished Fire")!;
		const mara = h.fixture.files.get("Mara Stoneway")!;
		await h.follow(scene);

		await clickLink(mara.path, { meta: true });

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, scene.path, false);
		expect(priv().navStack.length).toBe(0);
		expect(priv().subject.source).toBe("follow");
	});

	it("linkClickAction 'open' swaps: plain click OPENS instead of drilling", async () => {
		clickAction = "open";
		const scene = h.fixture.files.get("Scene 1 - The Extinguished Fire")!;
		const mara = h.fixture.files.get("Mara Stoneway")!;
		await h.follow(scene);

		await clickLink(mara.path);

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, scene.path, false);
		expect(priv().subject.source).toBe("follow");
	});

	it("linkClickAction 'open' swaps: modifier click DRILLS instead of opening", async () => {
		clickAction = "open";
		const scene = h.fixture.files.get("Scene 1 - The Extinguished Fire")!;
		const mara = h.fixture.files.get("Mara Stoneway")!;
		await h.follow(scene);

		await clickLink(mara.path, { meta: true });

		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		expect(priv().subject.source).toBe("drilled");
		expect(priv().navStack.map((f) => f.path)).toEqual([scene.path]);
	});

	it("swapping the active note between kinds re-renders with no stale content bleed (ADR-7)", async () => {
		// Scene 1 (has 'Point of view') → Moonharbor Lighthouse (has 'Inhabitants').
		await h.follow(h.fixture.files.get("Scene 1 - The Extinguished Fire")!);
		expect(sectionByLabel(h.body(), "Point of view")).not.toBeNull();

		await h.follow(h.fixture.files.get("Moonharbor Lighthouse")!);
		const body = h.body();
		expect(sectionByLabel(body, "Inhabitants")).not.toBeNull();
		// The scene-only section must be gone (teardown emptied the body).
		expect(sectionByLabel(body, "Point of view")).toBeNull();
	});
});

// ===========================================================================
// 4. EDGE CASES — empty relation / unresolved link / world cycle
// ===========================================================================

describe("T5.3 edge cases — empty, unresolved, and world-cycle handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("empty relation → renders the emptyLine copy (character with no scenes)", async () => {
		// A lone character with no backlinks: 'Appears in' must show the empty copy.
		const LONE: NoteSpec = {
			path: "30 Canon/31 Characters/Lone Wolf.md",
			basename: "Lone Wolf",
			tag: "#canon/character",
			frontmatter: { type: "character", name: "Lone Wolf", role: "supporting" },
			links: [],
		};
		const h = await mountPanel([LONE]);
		await h.follow(h.fixture.files.get("Lone Wolf")!);

		const appearsIn = sectionBody(h.body(), "Appears in")!;
		const empty = appearsIn.querySelector(".sf-emptyline");
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toBe("No scenes yet.");

		// Relationships is also empty → its empty copy shows.
		const rels = sectionBody(h.body(), "Relationships")!;
		expect(rels.querySelector(".sf-emptyline")?.textContent).toBe("No relationships yet.");

		await h.view.onClose();
	});

	it("unresolved link → .sf-unres row, aria-disabled, no data-sf-link", async () => {
		// A scene whose pov points at a ghost note that resolves to no file.
		const GHOST_SCENE: NoteSpec = {
			path: "10 Manuscript/Ghost Scene.md",
			basename: "Ghost Scene",
			tag: "#manuscript/scene",
			frontmatter: { type: "scene" },
			links: [["pov", "Nonexistent Ghost"]], // target has no NoteSpec → unresolved
		};
		const h = await mountPanel([GHOST_SCENE]);
		await h.follow(h.fixture.files.get("Ghost Scene")!);

		const pov = sectionBody(h.body(), "Point of view")!;
		const unres = pov.querySelector(".sf-unres");
		expect(unres).not.toBeNull();
		expect(unres?.getAttribute("aria-disabled")).toBe("true");
		// Unresolved rows must NOT be routable — no data-sf-link anywhere in the row.
		expect(unres?.querySelector("[data-sf-link]")).toBeNull();
		// The (Unresolved) marker is present (the name span is empty because the
		// resolver's unresolved stub carries only `.path`, not `.basename` — the
		// renderer reads basename, which is undefined for the stub).
		expect(unres?.querySelector(".sf-unres-mark")?.textContent).toBe("(Unresolved)");

		await h.view.onClose();
	});

	it("world cycle → location 'Within' terminates (single-level, no infinite loop)", async () => {
		// A ↔ B world cycle: Cavern.world = [[Cavern]] (self-reference) — the most
		// adversarial cycle. The location renderer is single-level (DV-2): it reads
		// only the first `world` entity and renders one breadcrumb. There is NO
		// recursion, so a cycle cannot loop. This asserts the pipeline TERMINATES
		// and produces a bounded render.
		const CAVERN: NoteSpec = {
			path: "30 Canon/32 Locations/Cavern.md",
			basename: "Cavern",
			tag: "#canon/location",
			frontmatter: { type: "location", name: "Cavern" },
			links: [["world", "Cavern"]], // self-cycle
		};
		const h = await mountPanel([CAVERN]);

		// If any world-chain walk were unbounded this would hang; the test timing out
		// is itself the failure signal. It completes → bounded render.
		await h.follow(h.fixture.files.get("Cavern")!);

		const within = sectionBody(h.body(), "Within");
		expect(within).not.toBeNull();
		// Exactly one breadcrumb level rendered (no runaway repetition).
		const crumbs = within!.querySelectorAll(".sf-breadcrumb");
		expect(crumbs.length).toBe(1);

		await h.view.onClose();
	});

	it("mutual A↔B world cycle also terminates with a bounded render", async () => {
		const ALPHA: NoteSpec = {
			path: "30 Canon/32 Locations/Alpha Realm.md",
			basename: "Alpha Realm",
			tag: "#canon/location",
			frontmatter: { type: "location", name: "Alpha Realm" },
			links: [["world", "Beta Realm"]],
		};
		const BETA: NoteSpec = {
			path: "30 Canon/32 Locations/Beta Realm.md",
			basename: "Beta Realm",
			tag: "#canon/location",
			frontmatter: { type: "location", name: "Beta Realm" },
			links: [["world", "Alpha Realm"]],
		};
		const h = await mountPanel([ALPHA, BETA]);

		await h.follow(h.fixture.files.get("Alpha Realm")!);
		const within = sectionBody(h.body(), "Within")!;
		expect(within.querySelectorAll(".sf-breadcrumb").length).toBe(1);
		// The one breadcrumb points at the parent (Beta), not an unbounded chain.
		expect(within.querySelector(".sf-lrow-lnk")?.textContent).toBe("Beta Realm");

		await h.view.onClose();
	});
});

// ===========================================================================
// 5. RESOLVER-LEVEL cross-check — backlinks in the NoteContext itself
// (asserts the resolve seam directly, independent of the renderer)
// ===========================================================================

describe("T5.3 resolver — NoteContext.backlinks carry the ground-truth reverse edges", () => {
	let fixture: Fixture;
	let scoping: ScopingService;

	beforeEach(() => {
		fixture = buildFixtureCache(SEED_NOTES);
		scoping = new ScopingService(fixture.app);
	});

	function resolve(basename: string): NoteContext {
		return scoping.resolve(fixture.files.get(basename)!);
	}

	it("Mara's backlinks include the three scenes via pov/characters", () => {
		const ctx = resolve("Mara Stoneway");
		const sceneBacklinks = ctx.backlinks.filter(
			(b) => b.kind === "scene" && (b.field === "pov" || b.field === "characters"),
		);
		const paths = new Set(sceneBacklinks.map((b) => b.file.basename));
		expect(paths).toEqual(
			new Set([
				"Scene 1 - The Extinguished Fire",
				"Scene 2 - The Salty Gull",
				"Scene 3 - The Black Cliffs",
			]),
		);
	});

	it("Tobias's backlinks include The Beacon Lens via owner", () => {
		const ctx = resolve("Tobias Ferro");
		const owns = ctx.backlinks.filter((b) => b.kind === "object" && b.field === "owner");
		expect(owns.map((b) => b.file.basename)).toEqual(["The Beacon Lens"]);
	});

	it("Lighthouse's inhabitants are outgoing entities Tobias + Mara", () => {
		const ctx = resolve("Moonharbor Lighthouse");
		const inhabitants = ctx.entities.filter((e) => e.field === "inhabitants");
		expect(inhabitants.map((e) => e.file.basename)).toEqual(["Tobias Ferro", "Mara Stoneway"]);
	});

	it("The Dying Light's backlinks include the three scenes via plotlines", () => {
		const ctx = resolve("The Dying Light");
		const scenes = ctx.backlinks.filter((b) => b.kind === "scene" && b.field === "plotlines");
		expect(new Set(scenes.map((b) => b.file.basename))).toEqual(
			new Set([
				"Scene 1 - The Extinguished Fire",
				"Scene 2 - The Salty Gull",
				"Scene 3 - The Black Cliffs",
			]),
		);
	});
});