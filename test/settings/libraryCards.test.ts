/**
 * T7.1c — Library › Cards (spec 008, Phase 7; mockups-library.html L4, L5a, L5b, L8c and
 * proposals P3, P11, P16, P19).
 *
 * Runs against the real `SettingsTab`, a real `ViewStore` and a real `CollectionStore` over an
 * in-memory data blob, so "a click wrote something" is read back from the stores. The preview is
 * drawn by the real card registry; only the vault (notes and their frontmatter) is a fixture.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, Notice, createMockTFile } from "../__mocks__/obsidian";
import { SettingsTab, type LibraryDeps } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "../../src/store/types";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { IndexedNote } from "../../src/codex/collectionResolver";
import { CollectionStore, type LibraryCard } from "../../src/library/collectionStore";
import { createLibraryPort } from "../../src/library/settingsPort";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types/index";
import { sentenceCaseViolations, visibleStrings } from "../helpers/sentenceCase";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const rec = (o: Partial<ViewRecord> = {}): ViewRecord => ({
	provenance: "imported",
	enabled: true,
	okayed: null,
	source: "00 Meta/Cards/Isekai hero.md",
	engine: "bases",
	command: false,
	kind: "card",
	surfaces: { anvil: false, workbench: false },
	...o,
});

/** L4's seed: Isekai hero (imported, used by Characters), Stat block (imported, disabled, unused). */
function seedViews(): Record<string, ViewRecord> {
	return {
		isekai: rec({ commandName: "Isekai hero" }),
		statblock: rec({ commandName: "Stat block", enabled: false, source: "00 Meta/Cards/Stat block.md" }),
		creatures: rec({
			kind: "collection",
			provenance: "curated",
			source: "00 Meta/Bases/Creatures.base",
			commandName: "Creatures",
			surfaces: { anvil: true, workbench: false },
			generated: { sourceChecksum: "s", params: { tag: "canon/creature", excludedFolders: ["00 Meta"] }, instanceChecksum: "i", filePath: "00 Meta/Bases/Creatures.base", verify: true },
		}),
		skills: rec({ kind: "collection", engine: "dataview-dql", source: "90 Views/Skills.md", commandName: "Skills", surfaces: { anvil: false, workbench: true } }),
	};
}

const NOTES: IndexedNote[] = [
	{ path: "30 Canon/Characters/Mara.md", tags: ["canon/character"] },
	{ path: "30 Canon/Characters/Tobias.md", tags: ["canon/character"] },
	{ path: "00 Meta/Templates/Character.md", tags: ["canon/character"] },
	{ path: "30 Canon/Places/Harbor.md", tags: ["canon/location"] },
];

const FRONTMATTER: Record<string, Record<string, unknown>> = {
	"30 Canon/Places/Harbor.md": { tags: ["canon/location"], locationType: "city", region: "harbour" },
	"30 Canon/Characters/Mara.md": { tags: ["canon/character"], role: "protagonist" },
};

interface WorldOptions {
	views?: Record<string, ViewRecord>;
	settings?: Partial<PluginSettings>;
	notes?: IndexedNote[];
}

function makeWorld(opts: WorldOptions = {}) {
	let data: StoryForgeData = { views: structuredClone(opts.views ?? seedViews()) };
	const port: PluginDataPort = {
		load: async () => structuredClone(data),
		save: async (d) => { data = structuredClone(d as StoryForgeData); },
	};
	const views = new ViewStore(port);
	const app = new App();
	app.vault.getFileByPath.mockImplementation((path: string) => createMockTFile({ path }));
	app.metadataCache.getFileCache.mockImplementation((file: { path: string }) => ({ frontmatter: FRONTMATTER[file.path] }));
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: { ...DEFAULT_SETTINGS, cardByCollection: { character: "isekai" }, ...opts.settings } as PluginSettings,
		saveSettings: vi.fn(async () => {}),
	};
	const collections = new CollectionStore(createLibraryPort(views, plugin));
	const gate = { evaluate: vi.fn(async () => ({ status: "consented" })), requestConsent: vi.fn(), requestReConsent: vi.fn() };
	const importFromVault = vi.fn();
	const deps: LibraryDeps = { collections, notes: () => opts.notes ?? NOTES, openCapabilities: vi.fn() };
	const noUndo = { setPersistence: async () => {}, clear: async () => {} };
	const tab = new SettingsTab(
		app, plugin as never, views, gate as unknown as ConsentGate, { scanVault: vi.fn(async () => []) } as unknown as ViewImporter, vi.fn(), vi.fn(), noUndo, deps,
	);
	return { tab, app, plugin, views, collections, importFromVault, stored: () => data.views ?? {} };
}

async function open(opts: WorldOptions = {}) {
	const w = makeWorld(opts);
	await w.tab.displayAsync();
	document.body.appendChild(w.tab.containerEl);
	return { ...w, root: w.tab.containerEl, slot: w.tab.containerEl.querySelector<HTMLElement>("[data-slot='cards']")! };
}

afterEach(() => {
	document.body.innerHTML = "";
	Notice._reset();
});

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();
const card = (root: ParentNode, id: string): HTMLElement => {
	const el = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
	if (!el) throw new Error(`no Cards row for ${id}`);
	return el;
};
const cardIds = (root: ParentNode): string[] =>
	[...root.querySelectorAll<HTMLElement>("[data-card-id]")].map((e) => e.dataset["cardId"] ?? "");
const btn = (root: ParentNode, label: string): HTMLButtonElement | null =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => text(b).replace(/\s*[▾▸]$/, "") === label) ?? null;
const cb = (root: ParentNode, id: string): HTMLInputElement => card(root, id).querySelector<HTMLInputElement>("input[type=checkbox]")!;
const flush = async (): Promise<void> => { await vi.waitFor(() => undefined); await new Promise((r) => setTimeout(r, 0)); };
async function click(el: Element | null): Promise<void> {
	if (!el) throw new Error("click target missing");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await flush();
}
async function key(el: Element | null, k: string): Promise<void> {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	await flush();
}
const region = (root: ParentNode, id: string): HTMLElement | null => card(root, id).querySelector<HTMLElement>("[role=region]");
const focusKey = (): string | undefined => (document.activeElement as HTMLElement | null)?.dataset["focus"];
async function preview(root: ParentNode, id: string): Promise<HTMLElement> {
	await click(btn(card(root, id), "Preview"));
	const r = region(root, id);
	if (!r) throw new Error(`preview for ${id} did not open`);
	return r;
}
const select = (r: HTMLElement): HTMLSelectElement => r.querySelector<HTMLSelectElement>("select")!;
async function sampleFrom(r: HTMLElement, collectionId: string): Promise<void> {
	const s = select(r);
	s.value = collectionId;
	s.dispatchEvent(new Event("change", { bubbles: true }));
	await flush();
}
const labels = (cards: LibraryCard[]): string[] => cards.map((c) => c.label);

// ---------------------------------------------------------------------------
// (1) L4 — rows, badges, no switches
// ---------------------------------------------------------------------------

describe("L4 · the Cards list", () => {
	it("lists the Cards in store order, each with its provenance badge and no surface switches", async () => {
		const w = await open();
		const expected = await w.collections.cards();
		expect(cardIds(w.slot)).toEqual(expected.map((c) => c.id));
		expect(cardIds(w.slot)).toEqual(["hero", "table", "compact", "isekai", "statblock"]);
		expect([...w.slot.querySelectorAll(".sf-lb-name")].map(text)).toEqual(labels(expected));
		expect(cardIds(w.slot).map((id) => text(card(w.slot, id).querySelector(".sf-lb-prov")))).toEqual(
			["built-in", "built-in", "built-in", "imported", "imported"],
		);
		expect(w.slot.querySelectorAll("[role=switch]")).toHaveLength(0);
		expect(w.slot.querySelectorAll(".sf-lb-eng")).toHaveLength(0);
	});

	it("sits under a Cards heading with the mockup's description", async () => {
		const w = await open();
		expect(text(w.slot.querySelector("[data-setting-name='Cards']"))).toContain("How entries are drawn. Chosen per collection and remembered.");
	});

	it("shows a disabled Card dimmed with its checkbox unticked", async () => {
		const w = await open();
		expect(cb(w.slot, "statblock").checked).toBe(false);
		expect(card(w.slot, "statblock").classList.contains("is-off")).toBe(true);
		expect(card(w.slot, "isekai").classList.contains("is-off")).toBe(false);
	});

	it("offers the same two add controls as the list above, in its own place", async () => {
		const w = await open();
		expect(btn(w.slot, "+ Import from vault…")).not.toBeNull();
		expect(btn(w.slot, "+ Browse repo…")!.disabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// (2) "used by"
// ---------------------------------------------------------------------------

describe("L4 · used by", () => {
	it("names the collections usedBy() returns, omits the line when none, and leaves Dataview out", async () => {
		const w = await open();
		for (const id of ["hero", "table", "compact", "isekai", "statblock"]) {
			const users = (await w.collections.usedBy(id)).map((c) => c.label);
			const line = card(w.slot, id).querySelector(".sf-lb-used");
			expect(line ? text(line) : null).toBe(users.length > 0 ? `used by ${users.join(", ")}` : null);
		}
		// Literal anchors, so the test does not only restate the store.
		expect(text(card(w.slot, "isekai").querySelector(".sf-lb-used"))).toBe("used by Characters");
		expect(text(card(w.slot, "hero").querySelector(".sf-lb-used"))).toBe("used by Locations, Objects, Lore, Creatures");
		expect(text(card(w.slot, "hero"))).not.toContain("Skills");
	});
});

// ---------------------------------------------------------------------------
// (3) P19 — Hero cannot be disabled; the others toggle
// ---------------------------------------------------------------------------

describe("P19 · the checkbox", () => {
	it("makes Hero's checkbox checked and inert, and says why", async () => {
		const w = await open();
		const box = cb(w.slot, "hero");
		expect(box.checked).toBe(true);
		expect(box.disabled).toBe(true);
		const why = document.getElementById(box.getAttribute("aria-describedby") ?? "");
		expect(text(why)).toBe("Hero is the fallback Card and is always available");
		expect(box.title).toBe("Hero is the fallback Card and is always available");
	});

	it("toggles every other Card through setCardEnabled and keeps focus on the checkbox", async () => {
		const w = await open();
		const spy = vi.spyOn(w.collections, "setCardEnabled");
		cb(w.slot, "table").checked = false;
		cb(w.slot, "table").dispatchEvent(new Event("change", { bubbles: true }));
		await flush();
		expect(spy).toHaveBeenCalledWith("table", false);
		expect((await w.collections.cards()).find((c) => c.id === "table")?.enabled).toBe(false);
		expect(cb(w.slot, "table").checked).toBe(false);
		expect(focusKey()).toBe("cb:table");

		cb(w.slot, "statblock").checked = true;
		cb(w.slot, "statblock").dispatchEvent(new Event("change", { bubbles: true }));
		await flush();
		expect(w.stored()["statblock"]?.enabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// (4) L8c / P16 — remove
// ---------------------------------------------------------------------------

describe("L8c · removing a Card", () => {
	it("gives a built-in Card no Remove, and an imported one a Remove", async () => {
		const w = await open();
		for (const id of ["hero", "table", "compact"]) expect(btn(card(w.slot, id), "Remove"), id).toBeNull();
		for (const id of ["isekai", "statblock"]) expect(btn(card(w.slot, id), "Remove"), id).not.toBeNull();
	});

	it("opens a confirmation on a bare click, names the fallback, writes nothing and focuses Cancel", async () => {
		const w = await open();
		const remove = vi.spyOn(w.collections, "removeCard");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		const box = card(w.slot, "isekai").querySelector<HTMLElement>(".sf-lb-confirm")!;
		expect(box.getAttribute("role")).toBe("group");
		expect(text(box)).toContain("Remove Isekai hero from the Library?");
		expect(text(box)).toContain("Characters will be drawn with Hero.");
		expect(text(box)).toContain("Your Card file stays in your vault. Nothing is deleted.");
		expect(remove).not.toHaveBeenCalled();
		expect(w.stored()["isekai"]).toBeDefined();
		expect(w.plugin.settings.cardByCollection).toEqual({ character: "isekai" });
		expect(focusKey()).toBe("cancel:isekai");
		expect(btn(card(w.slot, "isekai"), "Remove")!.getAttribute("aria-expanded")).toBe("true");
	});

	it("leaves out the fallback sentence when nothing uses the Card", async () => {
		const w = await open();
		await click(btn(card(w.slot, "statblock"), "Remove"));
		const box = card(w.slot, "statblock").querySelector<HTMLElement>(".sf-lb-confirm")!;
		expect(text(box)).not.toContain("drawn with Hero");
		expect(text(box)).toContain("Nothing is deleted.");
	});

	it("joins several collections in the fallback sentence", async () => {
		const w = await open({ settings: { cardByCollection: { character: "isekai", location: "isekai", object: "isekai" } } });
		await click(btn(card(w.slot, "isekai"), "Remove"));
		expect(text(card(w.slot, "isekai").querySelector(".sf-lb-confirm"))).toContain("Characters, Locations and Objects will be drawn with Hero.");
	});

	it("cancels with Cancel or Esc, writes nothing and returns focus to Remove", async () => {
		const w = await open();
		const remove = vi.spyOn(w.collections, "removeCard");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		await click(btn(card(w.slot, "isekai"), "Cancel"));
		expect(card(w.slot, "isekai").querySelector(".sf-lb-confirm")).toBeNull();
		expect(focusKey()).toBe("remove:isekai");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		await key(card(w.slot, "isekai").querySelector(".sf-lb-confirm"), "Escape");
		expect(card(w.slot, "isekai").querySelector(".sf-lb-confirm")).toBeNull();
		expect(focusKey()).toBe("remove:isekai");
		expect(remove).not.toHaveBeenCalled();
	});

	it("removes through removeCard on confirm: record gone, the choice forgotten, a notice, focus on the next row", async () => {
		const w = await open();
		const remove = vi.spyOn(w.collections, "removeCard");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		await click(btn(card(w.slot, "isekai").querySelector<HTMLElement>(".sf-lb-confirm")!, "Remove"));
		expect(remove).toHaveBeenCalledWith("isekai");
		expect(w.stored()["isekai"]).toBeUndefined();
		expect(w.plugin.settings.cardByCollection).toEqual({});
		expect(cardIds(w.slot)).toEqual(["hero", "table", "compact", "statblock"]);
		expect(Notice._instances.map((n) => n.message)).toEqual(["Removed Isekai hero from the Library. The file is still in your vault."]);
		expect(focusKey()).toBe("cb:statblock");
	});

	it("surfaces a refusal, keeps the row and returns focus to its Remove", async () => {
		const w = await open();
		vi.spyOn(w.collections, "removeCard").mockResolvedValueOnce({ ok: false, reason: "No card \"isekai\"" });
		await click(btn(card(w.slot, "isekai"), "Remove"));
		await click(btn(card(w.slot, "isekai").querySelector<HTMLElement>(".sf-lb-confirm")!, "Remove"));
		expect(Notice._instances.map((n) => n.message)).toEqual(["No card \"isekai\""]);
		expect(cardIds(w.slot)).toContain("isekai");
		expect(card(w.slot, "isekai").querySelector(".sf-lb-confirm")).toBeNull();
		expect(focusKey()).toBe("remove:isekai");
	});

	it("sends focus to the add control when the last row goes", async () => {
		const w = await open();
		await click(btn(card(w.slot, "statblock"), "Remove"));
		await click(btn(card(w.slot, "statblock").querySelector<HTMLElement>(".sf-lb-confirm")!, "Remove"));
		expect(focusKey()).toBe("add");
	});
});

// ---------------------------------------------------------------------------
// (5) L5a / P3 — the preview
// ---------------------------------------------------------------------------

describe("L5a · the preview", () => {
	it("opens inline under the row, focuses Close preview and draws the first entry of the first enabled collection that uses the Card", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		expect(r.getAttribute("aria-label")).toBe("Preview of Hero");
		const row = card(w.slot, "hero").querySelector(".sf-lb-row")!;
		expect(row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(btn(card(w.slot, "hero"), "Preview")!.getAttribute("aria-expanded")).toBe("true");
		expect(text(document.activeElement)).toBe("Close preview");
		// Hero is used by Locations first (Characters chose Isekai hero): the real Hero card, on Harbor's frontmatter.
		expect(select(r).value).toBe("location");
		expect(r.querySelector(".sf-cx-card.sf-cx-hero")).not.toBeNull();
		expect(text(r.querySelector(".sf-cx-name"))).toBe("Harbor");
		expect(text(r.querySelector(".sf-cx-hero-facts"))).toMatch(/^city\s*·\s*harbour$/);
		expect(text(r)).toContain("Read-only. Clicks do nothing here.");
	});

	it("lists every enabled collection in Sample from, Dataview ones and disabled ones left out, and switches the sample", async () => {
		const w = await open({ settings: { builtInCollections: { lore: { enabled: false } } } });
		const r = await preview(w.slot, "hero");
		expect([...select(r).options].map((o) => o.value)).toEqual(["character", "location", "object", "creatures"]);
		expect(r.querySelector("label")?.textContent).toBe("Sample from");
		await sampleFrom(r, "character");
		const after = region(w.slot, "hero")!;
		expect(select(after).value).toBe("character");
		expect(text(after.querySelector(".sf-cx-name"))).toBe("Mara");
		expect(focusKey()).toBe("sample:hero");
	});

	it("draws the Card being previewed, not always Hero (Table and Compact differ)", async () => {
		const w = await open();
		const r = await preview(w.slot, "compact");
		expect(r.querySelector(".sf-cx-hero")).toBeNull();
		expect(r.querySelector(".sf-cx-compact, .sf-cx-card")).not.toBeNull();
		expect(r.querySelector(".sf-cx-card")!.className).not.toContain("sf-cx-hero");
	});

	it("is inert: no navigation markers, not focusable, and a click or a title click writes and opens nothing", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		const body = r.querySelector(".sf-lb-prev-body")!;
		expect(body.querySelectorAll("[data-sf-link], [data-sf-card-title], [data-sf-card-body]")).toHaveLength(0);
		expect(body.querySelector("[tabindex]")).toBeNull();
		expect(body.querySelector("[role=button]")).toBeNull();
		expect(body.querySelector(".sf-cx-card")!.hasAttribute("inert")).toBe(true);
		const title = body.querySelector(".sf-cx-name")!;
		// These cannot fail today (nothing listens in Settings); they guard against a future delegated click handler.
		await click(title);
		await click(body.querySelector(".sf-cx-card"));
		expect(w.app.vault.process).not.toHaveBeenCalled();
		expect(w.app.vault.modify).not.toHaveBeenCalled();
		expect(Notice._instances).toHaveLength(0);
		expect(region(w.slot, "hero")).not.toBeNull();
	});

	it("closes with Esc inside the region and returns focus to the Preview button", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		await key(r.querySelector("button"), "Escape");
		expect(region(w.slot, "hero")).toBeNull();
		expect(focusKey()).toBe("preview:hero");
		expect(btn(card(w.slot, "hero"), "Preview")!.getAttribute("aria-expanded")).toBe("false");
	});

	it("closes with Close preview and with Preview again, focus back on Preview", async () => {
		const w = await open();
		await preview(w.slot, "hero");
		await click(btn(card(w.slot, "hero"), "Close preview"));
		expect(region(w.slot, "hero")).toBeNull();
		expect(focusKey()).toBe("preview:hero");
		await preview(w.slot, "hero");
		await click(btn(card(w.slot, "hero"), "Preview"));
		expect(region(w.slot, "hero")).toBeNull();
		expect(focusKey()).toBe("preview:hero");
	});

	it("keeps one preview open at a time", async () => {
		const w = await open();
		await preview(w.slot, "hero");
		await preview(w.slot, "table");
		expect(region(w.slot, "hero")).toBeNull();
		expect(region(w.slot, "table")).not.toBeNull();
		expect(w.slot.querySelectorAll("[role=region]")).toHaveLength(1);
	});

	it("previews a disabled Card, and writes nothing to do it", async () => {
		const w = await open();
		const before = JSON.stringify([w.stored(), w.plugin.settings]);
		const r = await preview(w.slot, "statblock");
		expect(r.querySelector(".sf-cx-card")).not.toBeNull();
		expect(cb(w.slot, "statblock").checked).toBe(false);
		expect(JSON.stringify([w.stored(), w.plugin.settings])).toBe(before);
	});

	it("falls back to the first enabled collection when no collection uses the Card", async () => {
		const w = await open();
		const r = await preview(w.slot, "statblock");
		expect(select(r).value).toBe("character");
		expect(text(r.querySelector(".sf-cx-name"))).toBe("Mara");
	});

	it("forgets a removed Card's preview and sample, so importing the same Card again starts closed", async () => {
		const w = await open();
		const r = await preview(w.slot, "isekai");
		await sampleFrom(r, "creatures");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		await click(btn(card(w.slot, "isekai").querySelector<HTMLElement>(".sf-lb-confirm")!, "Remove"));
		expect(w.slot.querySelectorAll("[role=region]")).toHaveLength(0);
		await w.views.setRecord("isekai", rec({ commandName: "Isekai hero" }));
		await flush();
		expect(region(w.slot, "isekai")).toBeNull();
		expect(btn(card(w.slot, "isekai"), "Preview")!.getAttribute("aria-expanded")).toBe("false");
		const again = await preview(w.slot, "isekai");
		expect(select(again).value).not.toBe("creatures");
	});
});

// ---------------------------------------------------------------------------
// (6) L5b — nothing to sample
// ---------------------------------------------------------------------------

describe("L5b · nothing to sample", () => {
	it("says the collection has no entries and draws no fake entry, keeping the dropdown", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		await sampleFrom(r, "creatures");
		const after = region(w.slot, "hero")!;
		expect(text(after.querySelector(".sf-lb-prev-body"))).toBe(
			"Creatures has no entries yet, so there is nothing to preview. Choose another collection above.",
		);
		expect(after.querySelector(".sf-cx-card")).toBeNull();
		expect(select(after).value).toBe("creatures");
	});

	it("says to enable a collection when none is enabled, and hides the dropdown", async () => {
		const off = { enabled: false };
		const w = await open({
			views: { ...seedViews(), creatures: rec({ ...seedViews()["creatures"]!, enabled: false }), skills: rec({ ...seedViews()["skills"]!, enabled: false }) },
			settings: { builtInCollections: { character: off, location: off, object: off, lore: off } },
		});
		const r = await preview(w.slot, "hero");
		expect(text(r.querySelector(".sf-lb-prev-body"))).toBe("Enable a collection to preview this Card.");
		expect(r.querySelector("select")).toBeNull();
		expect(r.querySelector(".sf-cx-card")).toBeNull();
	});

	it("says the enabled collections are Dataview and use no Cards, when only those are enabled", async () => {
		const off = { enabled: false };
		const w = await open({
			views: { ...seedViews(), creatures: rec({ ...seedViews()["creatures"]!, enabled: false }) },
			settings: { builtInCollections: { character: off, location: off, object: off, lore: off } },
		});
		const r = await preview(w.slot, "hero");
		expect(text(r.querySelector(".sf-lb-prev-body"))).toBe("Only Dataview collections are enabled, and they don't use Cards.");
		expect(r.querySelector("select")).toBeNull();
		expect(r.querySelector(".sf-cx-card")).toBeNull();
	});

	it("treats a collection whose only entries are excluded as having none", async () => {
		const w = await open({ notes: [{ path: "00 Meta/Templates/Character.md", tags: ["canon/character"] }] });
		const r = await preview(w.slot, "table");
		expect(text(r.querySelector(".sf-lb-prev-body"))).toContain("has no entries yet");
	});
});

// ---------------------------------------------------------------------------
// (7) focus and stale reads — the LibrarySection pattern
// ---------------------------------------------------------------------------

describe("focus and stale reads", () => {
	/** `cards()` calls made from now on wait for `release`, answering with the snapshot taken now. */
	async function gateNextRead(w: Awaited<ReturnType<typeof open>>): Promise<() => void> {
		const snapshot = (await w.collections.cards()).map((c) => ({ ...c, label: `Stale ${c.label}` }));
		let release: () => void = () => undefined;
		const gate = new Promise<void>((r) => { release = r; });
		vi.spyOn(w.collections, "cards").mockImplementationOnce(async () => { await gate; return snapshot; });
		return release;
	}

	it("does not paint a read that finished after the tab was hidden", async () => {
		const w = await open();
		const release = await gateNextRead(w);
		await w.collections.removeCard("statblock");
		w.tab.hide();
		release();
		await flush();
		expect(text(w.slot)).not.toContain("Stale");
		expect(cardIds(w.slot)).toContain("statblock");
	});

	it("does not steal focus later with a focus request left over from a read dropped on hide", async () => {
		const w = await open();
		const release = await gateNextRead(w);
		await click(btn(card(w.slot, "hero"), "Preview"));
		w.tab.hide();
		release();
		await flush();
		cb(w.slot, "table").focus();
		await click(w.root.querySelector("[role=tab]"));
		expect(focusKey()).toBe("cb:table");
	});

	it("does not let an older read overwrite a newer paint", async () => {
		const w = await open();
		const release = await gateNextRead(w);
		await w.collections.removeCard("statblock");
		await w.collections.removeCard("isekai");
		await flush();
		release();
		await flush();
		expect(text(w.slot)).not.toContain("Stale");
		expect(cardIds(w.slot)).toEqual(["hero", "table", "compact"]);
	});

	it("keeps focus on the control that had it across a repaint from outside", async () => {
		const w = await open();
		const table = cb(w.slot, "table");
		table.focus();
		await w.collections.removeCard("statblock");
		await flush();
		expect(focusKey()).toBe("cb:table");
		expect(document.activeElement).toBe(cb(w.slot, "table"));
	});

	it("keeps the open preview and its chosen sample across a repaint", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		await sampleFrom(r, "character");
		await w.collections.removeCard("statblock");
		await flush();
		expect(select(region(w.slot, "hero")!).value).toBe("character");
	});

	it("falls back to the default sample when the chosen collection is gone", async () => {
		const w = await open();
		const r = await preview(w.slot, "hero");
		await sampleFrom(r, "creatures");
		await w.collections.remove("creatures");
		await flush();
		expect(select(region(w.slot, "hero")!).value).toBe("location");
	});

	it("repaints when the Library tab is selected again, so a collection change shows in used by", async () => {
		const w = await open();
		w.plugin.settings.cardByCollection = { character: "isekai", object: "isekai" };
		const lib = w.root.querySelector<HTMLElement>("[role=tab]")!;
		await click(lib);
		expect(text(card(w.slot, "isekai").querySelector(".sf-lb-used"))).toBe("used by Characters, Objects");
	});
});

// ---------------------------------------------------------------------------
// (8) sentence case, over the rendered text
// ---------------------------------------------------------------------------

describe("sentence case in the Cards text", () => {
	const names = ["Isekai hero", "Stat block", "Characters", "Locations", "Objects", "Lore", "Creatures", "Skills"];

	async function everything(): Promise<string[]> {
		const w = await open();
		await preview(w.slot, "hero");
		await sampleFrom(region(w.slot, "hero")!, "creatures");
		await click(btn(card(w.slot, "isekai"), "Remove"));
		return visibleStrings(w.slot);
	}

	it("paints the list, the preview and the confirmation, and none has a stray capital", async () => {
		const strings = await everything();
		for (const expected of [
			"How entries are drawn. Chosen per collection and remembered.", "built-in", "imported", "used by Locations, Objects, Lore, Creatures",
			"Sample from", "Close preview", "Read-only. Clicks do nothing here.", "Nothing is deleted.",
		]) {
			expect(strings.some((t) => t.includes(expected)), expected).toBe(true);
		}
		const offenders = strings.flatMap((t) => sentenceCaseViolations(t, names).map((word) => `${word} in "${t}"`));
		expect(offenders).toEqual([]);
	});
});
