/**
 * SettingsTab — Manage Views, mason-style cards (spec 003)
 *
 * Covers the card DOM (S28–S31): provenance chip, kind pill, command pill,
 * status pill (glyph+label+modifier), version, the toggle, and the ⋯ overflow
 * menu — plus the toolbar (Import from vault / disabled Import from repo) and the
 * blocked-reason row for engine-missing. The regression suites (gen-guard,
 * observer refresh, Edit reconcile) from spec 002 are preserved.
 *
 * @ref docs/XDD/specs/003-settings-view-rows/plan.md §"Card contract"
 * @ref mockups.html S28–S31
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Menu } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ViewRecord } from "../../src/store/types";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { RegisterCommandCallback } from "../../src/import/types";
import { BindModal } from "../../src/import/BindModal";

type RemoveCommandCallback = (viewId: string) => void;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeStore(initial: Record<string, ViewRecord> = {}): ViewStore {
	const data = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return new ViewStore(port);
}

function makeConsentGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "not-consented" as const })),
		requestConsent: vi.fn(async () => true),
		requestReConsent: vi.fn(async () => true),
	} as unknown as ConsentGate;
}

/**
 * A ConsentGate whose evaluate() resolves a fixed decision status. Used by the
 * drift-aware row tests: the row-state decision is made via the enabled
 * projection `gate.evaluate({ ...record, enabled: true })`.
 */
function makeGateWithDecision(
	status:
		| "consented"
		| "not-consented"
		| "drift"
		| "platform-restricted"
		| "engine-missing"
		| "dvjs-off",
): ConsentGate {
	return {
		evaluate: vi.fn(async () =>
			status === "drift"
				? ({ status: "drift" as const, reason: "checksum" as const })
				: ({ status } as { status: typeof status }),
		),
		requestConsent: vi.fn(async () => true),
		requestReConsent: vi.fn(async () => true),
	} as unknown as ConsentGate;
}

function makeImporter(): ViewImporter {
	return {
		scanVault: vi.fn(async () => []),
		parse: vi.fn(async () => { throw new Error("not used"); }),
		importToStore: vi.fn(async () => "id"),
	} as unknown as ViewImporter;
}

const noop: RegisterCommandCallback = () => {};

function makeRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: false,
		okayed: null,
		source: "views/my-view.md",
		engine: "dataview-dql",
		command: false,
		commandName: "My View",
		...overrides,
	};
}

function makeTab(
	app: App,
	store: ViewStore,
	gate: ConsentGate,
	importer: ViewImporter,
	registerCommand: RegisterCommandCallback = noop,
	removeCommand: RemoveCommandCallback = () => {},
): SettingsTab {
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: { exampleSetting: "" },
		saveSettings: vi.fn(async () => {}),
	};
	return new SettingsTab(app, plugin as never, store, gate, importer, registerCommand, removeCommand);
}

async function renderTab(tab: SettingsTab): Promise<HTMLElement> {
	await tab.displayAsync();
	return tab.containerEl;
}

/** Find a button by its text within a container. */
function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	const buttons = root.querySelectorAll("button");
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

/** The single card element (tests render one view at a time). */
function card(root: ParentNode): HTMLElement {
	const el = root.querySelector(".sf-view-card");
	if (!el) throw new Error("no .sf-view-card rendered");
	return el as HTMLElement;
}

/** The card whose name span matches `name` (for multi-view containers). */
function cardByName(root: ParentNode, name: string): HTMLElement | null {
	for (const c of root.querySelectorAll(".sf-view-card")) {
		if (c.querySelector(".sf-view-name")?.textContent === name) return c as HTMLElement;
	}
	return null;
}

/**
 * Click the ⋯ button inside `cardEl` and return the Menu instance that was
 * built and shown inside the click handler. The handler constructs a fresh
 * Menu and calls showAtMouseEvent — we spy on the prototype to capture it.
 */
function openRowMenu(cardEl: HTMLElement): Menu {
	const showSpy = vi.spyOn(Menu.prototype, "showAtMouseEvent");
	const btn = cardEl.querySelector(".sf-view-menu-btn") as HTMLButtonElement | null;
	if (!btn) throw new Error("no .sf-view-menu-btn in card");
	btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	const menu = showSpy.mock.instances[0] as unknown as Menu;
	showSpy.mockRestore();
	if (!menu) throw new Error("menu was not shown");
	return menu;
}

/** Titles of the menu's item entries in order (separators skipped). */
function menuItemTitles(menu: Menu): string[] {
	return menu._entries
		.filter((e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item")
		.map((e) => String(e.title));
}

// ---------------------------------------------------------------------------
// Section structure + toolbar
// ---------------------------------------------------------------------------

describe("SettingsTab — Views section structure", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("renders a 'Views' heading", async () => {
		const tab = makeTab(app, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(container.textContent ?? "").toContain("Views");
	});

	it("renders empty-state message when no views are imported", async () => {
		const tab = makeTab(app, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(container.textContent ?? "").toContain("No views imported yet");
	});

	it("does not show empty-state when at least one view exists", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(container.textContent ?? "").not.toContain("No views imported yet");
	});

	it("renders a card list wrapper with one card per view", async () => {
		const store = makeStore({
			v1: makeRecord({ enabled: true, commandName: "Alpha" }),
			v2: makeRecord({ enabled: true, commandName: "Beta" }),
		});
		const gate = makeGateWithDecision("consented");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		expect(container.querySelector(".sf-view-list")).not.toBeNull();
		expect(container.querySelectorAll(".sf-view-card").length).toBe(2);
	});

	it("toolbar has an enabled 'Import from vault' and a disabled 'Import from repo' button", async () => {
		const tab = makeTab(app, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const toolbar = container.querySelector(".sf-views-toolbar");
		expect(toolbar).not.toBeNull();

		const vault = findButton(toolbar!, "Import from vault");
		expect(vault).not.toBeNull();
		expect(vault!.disabled).toBe(false);

		const repo = findButton(toolbar!, "Import from repo");
		expect(repo).not.toBeNull();
		expect(repo!.disabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Card head — name, chip, kind pill, command pill, version
// ---------------------------------------------------------------------------

describe("SettingsTab — card head elements", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("name = commandName when present", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, commandName: "My Label" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-name")?.textContent).toBe("My Label");
	});

	it("name falls back to basename of source when commandName absent", async () => {
		const rec = makeRecord({ enabled: true, source: "views/some-view.md" });
		delete rec.commandName;
		const store = makeStore({ v1: rec });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-name")?.textContent).toBe("some-view");
	});

	it("provenance chip: imported → 'Imported' with sf-chip-imported", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, provenance: "imported" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const chip = card(container).querySelector(".sf-view-chip");
		expect(chip?.textContent).toBe("Imported");
		expect(chip?.classList.contains("sf-chip-imported")).toBe(true);
	});

	it("provenance chip: curated → 'Official' with sf-chip-official", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, provenance: "curated" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const chip = card(container).querySelector(".sf-view-chip");
		expect(chip?.textContent).toBe("Official");
		expect(chip?.classList.contains("sf-chip-official")).toBe(true);
	});

	it.each([
		["dataviewjs", "sf-badge-dvjs", "dataviewjs"],
		["dataview-dql", "sf-badge-dql", "dql"],
		["bases", "sf-badge-bases", "bases"],
	] as const)("kind pill: engine %s → %s '%s'", async (engine, cls, text) => {
		const store = makeStore({ v1: makeRecord({ enabled: true, engine }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const badge = card(container).querySelector(".sf-badge");
		expect(badge?.classList.contains(cls)).toBe(true);
		expect(badge?.textContent).toBe(text);
	});

	it("command pill present with title when record.command is true", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, command: true, commandLabel: "Run It" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const cmd = card(container).querySelector(".sf-view-cmd");
		expect(cmd).not.toBeNull();
		expect(cmd?.textContent).toBe("command");
		expect((cmd as HTMLElement).title).toBe("Run It");
	});

	it("command pill absent when record.command is false", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, command: false }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-cmd")).toBeNull();
	});

	it("version pill present as v{n} when okayed present", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 3, checksum: "x" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const ver = card(container).querySelector(".sf-view-ver");
		expect(ver?.textContent).toBe("v3");
	});

	it("version pill absent when okayed is null", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: null }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-ver")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Status pill mapping
// ---------------------------------------------------------------------------

describe("SettingsTab — status pill mapping", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	function statusOf(cardEl: HTMLElement): { glyph: string; label: string; classes: string[] } {
		const pill = cardEl.querySelector(".sf-view-status") as HTMLElement;
		const spans = pill.querySelectorAll("span");
		return {
			glyph: spans[0]?.textContent ?? "",
			label: spans[1]?.textContent ?? "",
			classes: Array.from(pill.classList),
		};
	}

	it("enabled + consented → ● Active / sf-status-active", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("●");
		expect(s.label).toBe("Active");
		expect(s.classes).toContain("sf-status-active");
	});

	it("disabled + consented → ○ Disabled / no modifier", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false, okayed: { version: 1, checksum: "x" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("○");
		expect(s.label).toBe("Disabled");
		expect(s.classes).not.toContain("sf-status-active");
		expect(s.classes).not.toContain("sf-status-consent");
	});

	it("disabled + not-consented → ○ Disabled / no modifier", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("not-consented"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("○");
		expect(s.label).toBe("Disabled");
	});

	it("drift → ▲ Consent required / sf-status-consent", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("drift"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("▲");
		expect(s.label).toBe("Consent required");
		expect(s.classes).toContain("sf-status-consent");
	});

	it("enabled + not-consented → ▲ Consent required / sf-status-consent", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: null }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("not-consented"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("▲");
		expect(s.label).toBe("Consent required");
		expect(s.classes).toContain("sf-status-consent");
	});

	it("engine-missing → ■ Engine unavailable / sf-status-missing", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("■");
		expect(s.label).toBe("Engine unavailable");
		expect(s.classes).toContain("sf-status-missing");
	});

	it("dvjs-off → ○ Unavailable / no modifier", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, engine: "dataviewjs" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("dvjs-off"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("○");
		expect(s.label).toBe("Unavailable");
	});

	it("platform-restricted → ○ Unavailable / no modifier", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, engine: "dataviewjs" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("platform-restricted"), makeImporter()));
		const s = statusOf(card(container));
		expect(s.glyph).toBe("○");
		expect(s.label).toBe("Unavailable");
	});
});

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

describe("SettingsTab — toggle presence and wiring", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	const toggleOf = (cardEl: HTMLElement) => cardEl.querySelector('[role="switch"]');

	it("toggle present for consented", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(toggleOf(card(container))).not.toBeNull();
	});

	it("toggle present for not-consented", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("not-consented"), makeImporter()));
		expect(toggleOf(card(container))).not.toBeNull();
	});

	it.each(["drift", "engine-missing", "dvjs-off", "platform-restricted"] as const)(
		"toggle absent for %s",
		async (status) => {
			const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
			const container = await renderTab(makeTab(app, store, makeGateWithDecision(status), makeImporter()));
			expect(toggleOf(card(container))).toBeNull();
		},
	);

	it("toggle OFF on an enabled+consented view calls setRecord(enabled:false)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));

		(toggleOf(card(container)) as HTMLElement).click();
		await vi.waitFor(() =>
			expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({ enabled: false })),
		);
	});

	it("toggle ON a disabled+consented view re-enables (setRecord enabled:true, no consent modal)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false, okayed: { version: 1, checksum: "x" } }) });
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const gate = makeGateWithDecision("consented");
		const container = await renderTab(makeTab(app, store, gate, makeImporter()));

		(toggleOf(card(container)) as HTMLElement).click();
		await vi.waitFor(() =>
			expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({ enabled: true })),
		);
		expect(gate.requestConsent).not.toHaveBeenCalled();
	});

	it("toggle ON a disabled+not-consented view calls requestConsent", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false, okayed: null }) });
		const gate = makeGateWithDecision("not-consented");
		const container = await renderTab(makeTab(app, store, gate, makeImporter()));

		(toggleOf(card(container)) as HTMLElement).click();
		await vi.waitFor(() =>
			expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ enabled: false })),
		);
	});
});

// ---------------------------------------------------------------------------
// ⋯ overflow menu
// ---------------------------------------------------------------------------

describe("SettingsTab — ⋯ overflow menu", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("consented (okayed present): View source, Edit, Re-review, separator, Remove — in order", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));

		const menu = openRowMenu(card(container));
		expect(menuItemTitles(menu)).toEqual([
			"View source",
			"Edit (rename & command)…",
			"Re-review consent…",
			"Remove",
		]);
		// separator sits before Remove (last entry is the Remove item)
		const kinds = menu._entries.map((e) => e.kind);
		expect(kinds[kinds.length - 2]).toBe("separator");
		expect(kinds[kinds.length - 1]).toBe("item");
	});

	it("not-consented (okayed null): no Re-review item", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false, okayed: null }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("not-consented"), makeImporter()));

		const titles = menuItemTitles(openRowMenu(card(container)));
		expect(titles).toContain("View source");
		expect(titles).toContain("Edit (rename & command)…");
		expect(titles).not.toContain("Re-review consent…");
		expect(titles[titles.length - 1]).toBe("Remove");
	});

	it("drift with okayed:null still shows Re-review (gated purely by the drift branch)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: null }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("drift"), makeImporter()));
		expect(menuItemTitles(openRowMenu(card(container)))).toContain("Re-review consent…");
	});

	it("engine-missing: menu is View source + Remove only (no Edit)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter()));
		expect(menuItemTitles(openRowMenu(card(container)))).toEqual(["View source", "Remove"]);
	});

	it("engine-missing WITH stored consent: still View source + Remove only (no Re-review, no Edit)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "sha256:abc" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter()));
		const titles = menuItemTitles(openRowMenu(card(container)));
		expect(titles).toEqual(["View source", "Remove"]);
		expect(titles).not.toContain("Re-review consent…");
		expect(titles).not.toContain("Edit (rename & command)…");
	});

	it("View source onClick calls app.workspace.openLinkText with the source path", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, source: "views/foo.md", okayed: { version: 1, checksum: "x" } }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));

		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "View source");
		expect(entry?.kind).toBe("item");
		(entry as { onClickFn?: () => void }).onClickFn?.();
		expect(app.workspace.openLinkText).toHaveBeenCalledWith("views/foo.md", "", false);
	});

	it("Re-review onClick calls requestReConsent", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
		const gate = makeGateWithDecision("drift");
		const container = await renderTab(makeTab(app, store, gate, makeImporter()));

		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Re-review consent…");
		(entry as { onClickFn?: () => void }).onClickFn?.();
		await vi.waitFor(() => expect(gate.requestReConsent).toHaveBeenCalledWith("v1", expect.anything()));
	});

	it("Edit onClick opens BindModal.present", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" } }) });
		const presentSpy = vi.spyOn(BindModal.prototype, "present").mockResolvedValue(null);
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));

		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Edit (rename & command)…");
		(entry as { onClickFn?: () => void }).onClickFn?.();
		await vi.waitFor(() => expect(presentSpy).toHaveBeenCalled());
		presentSpy.mockRestore();
	});

	it("Remove onClick calls removeCommand + store.deleteRecord", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false }) });
		const deleteRecordSpy = vi.spyOn(store, "deleteRecord");
		const removeCommand = vi.fn();
		const container = await renderTab(makeTab(app, store, makeConsentGate(), makeImporter(), noop, removeCommand));

		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Remove");
		(entry as { onClickFn?: () => void }).onClickFn?.();
		expect(removeCommand).toHaveBeenCalledWith("v1");
		await vi.waitFor(() => expect(deleteRecordSpy).toHaveBeenCalledWith("v1"));
	});
});

// ---------------------------------------------------------------------------
// Description line + blocked reason
// ---------------------------------------------------------------------------

describe("SettingsTab — description and blocked reason", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("description shows record.description when present", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, description: "A helpful blurb." }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-desc")?.textContent).toBe("A helpful blurb.");
	});

	it("description falls back to source when no description", async () => {
		const rec = makeRecord({ enabled: true, source: "views/path.md" });
		delete rec.description;
		const store = makeStore({ v1: rec });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		expect(card(container).querySelector(".sf-view-desc")?.textContent).toBe("views/path.md");
	});

	it("engine-missing renders a blocked reason row with an Install Dataview link and no toggle", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, engine: "dataviewjs" }) });
		const container = await renderTab(makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter()));
		const c = card(container);

		const reason = c.querySelector(".sf-view-blocked-reason");
		expect(reason).not.toBeNull();
		const link = reason!.querySelector("a");
		expect(link?.textContent).toBe("Install Dataview");
		expect(c.querySelector('[role="switch"]')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Import toolbar wiring
// ---------------------------------------------------------------------------

describe("SettingsTab — Import from vault", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("renders an 'Import from vault' button", async () => {
		const tab = makeTab(app, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		expect(findButton(container, "Import from vault")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Bug A — store subscription refreshes views list
// ---------------------------------------------------------------------------

function makeFakeStoreForTab(
	initial: Record<string, ViewRecord> = {},
): ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void } {
	let views = { ...initial };
	const subscribers = new Set<() => void>();

	function fire(): void { for (const cb of subscribers) cb(); }

	const store = {
		async getViews(): Promise<Record<string, ViewRecord>> {
			return { ...views };
		},
		subscribe(cb: () => void): () => void {
			subscribers.add(cb);
			return () => { subscribers.delete(cb); };
		},
		async setRecord(id: string, rec: ViewRecord): Promise<void> {
			views = { ...views, [id]: rec };
			fire();
		},
		async deleteRecord(id: string): Promise<void> {
			const next = { ...views };
			delete next[id];
			views = next;
			fire();
		},
		get _views() { return views; },
		set _views(v: Record<string, ViewRecord>) { views = v; },
		_fire(): void { fire(); },
		get _subscriberCount(): number { return subscribers.size; },
	} as unknown as ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void };

	return store;
}

describe("SettingsTab — Bug A: store subscription refreshes views list", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("firing the store subscriber re-renders a newly added view without calling display() again", async () => {
		const store = makeFakeStoreForTab({});
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());
		await tab.displayAsync();
		expect(tab.containerEl.textContent).toContain("No views imported yet");

		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			"new-v1": makeRecord({ commandName: "Imported View" }),
		};
		store._fire();

		await vi.waitFor(() => expect(tab.containerEl.textContent).toContain("Imported View"));
		expect(tab.containerEl.textContent).not.toContain("No views imported yet");
	});

	it("hide() unsubscribes so a post-hide store fire does NOT re-render", async () => {
		const store = makeFakeStoreForTab({ v1: makeRecord({ commandName: "View 1" }) });
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());

		await tab.displayAsync();
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);

		tab.hide();
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(0);

		const displayAsyncSpy = vi.spyOn(tab, "displayAsync");
		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			v1: makeRecord({ commandName: "View 1" }),
			v2: makeRecord({ commandName: "Should Not Appear" }),
		};
		store._fire();
		await Promise.resolve();
		await Promise.resolve();

		expect(displayAsyncSpy).not.toHaveBeenCalled();
		expect(tab.containerEl.textContent).not.toContain("Should Not Appear");
	});

	it("repeated display() calls do not create multiple subscriptions", async () => {
		const store = makeFakeStoreForTab({});
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());
		await tab.displayAsync();
		await tab.displayAsync();
		await tab.displayAsync();
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);
	});

	it("hide() → displayAsync() re-open re-subscribes exactly once and store events still update", async () => {
		const store = makeFakeStoreForTab({ v1: makeRecord({ commandName: "View 1" }) });
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());

		await tab.displayAsync();
		tab.hide();
		await tab.displayAsync();
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);

		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			v1: makeRecord({ commandName: "View 1" }),
			v2: makeRecord({ commandName: "Newly Imported" }),
		};
		store._fire();
		await vi.waitFor(() => expect(tab.containerEl.textContent).toContain("Newly Imported"));
	});
});

// ---------------------------------------------------------------------------
// Bug B — _displayGen guard coalesces concurrent renders (no doubled cards)
// ---------------------------------------------------------------------------

function countCards(container: HTMLElement, names: string[]): number {
	let count = 0;
	for (const c of container.querySelectorAll(".sf-view-card")) {
		const name = c.querySelector(".sf-view-name")?.textContent ?? "";
		if (names.includes(name)) count++;
	}
	return count;
}

describe("SettingsTab — Bug B: _displayGen guard coalesces concurrent displayAsync() calls", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("two concurrent renders produce exactly one card per view", async () => {
		const store = makeFakeStoreForTab({
			v1: makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			v2: makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());

		const p1 = tab.displayAsync();
		const p2 = tab.displayAsync();
		await Promise.all([p1, p2]);

		expect(countCards(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});

	it("re-entrancy holds across the evaluate await", async () => {
		const store = makeFakeStoreForTab({
			v1: makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			v2: makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		const gate = {
			evaluate: vi.fn(async () => {
				await Promise.resolve();
				return { status: "consented" as const };
			}),
			requestConsent: vi.fn(async () => true),
			requestReConsent: vi.fn(async () => true),
		} as unknown as ConsentGate;

		const tab = makeTab(app, store as unknown as ViewStore, gate, makeImporter());
		const p1 = tab.displayAsync();
		const p2 = tab.displayAsync();
		await Promise.all([p1, p2]);

		expect(countCards(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Observer-driven refresh — toggle + remove drive correct state changes
// ---------------------------------------------------------------------------

describe("SettingsTab — observer-driven refresh via store subscriber", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("Remove via menu removes the view card from the list", async () => {
		const store = makeFakeStoreForTab({
			keep: makeRecord({ enabled: true, commandName: "Keep This", engine: "dataview-dql" }),
			gone: makeRecord({ enabled: true, commandName: "Gone View", engine: "dataview-dql" }),
		});
		const removeCommand = vi.fn();
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter(), noop, removeCommand);
		await tab.displayAsync();

		const goneCard = cardByName(tab.containerEl, "Gone View");
		expect(goneCard).not.toBeNull();
		const menu = openRowMenu(goneCard!);
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Remove");
		(entry as { onClickFn?: () => void }).onClickFn?.();

		await vi.waitFor(() => expect(tab.containerEl.textContent).toContain("Keep This"));
		expect(cardByName(tab.containerEl, "Gone View")).toBeNull();
		expect(countCards(tab.containerEl, ["Keep This"])).toBe(1);
	});

	it("toggle OFF updates the enabled card to a disabled card", async () => {
		const store = makeFakeStoreForTab({
			v1: makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" }, commandName: "Toggle View", engine: "dataview-dql" }),
		});
		const tab = makeTab(app, store as unknown as ViewStore, makeGateWithDecision("consented"), makeImporter());
		await tab.displayAsync();

		const statusLabel = () => card(tab.containerEl).querySelectorAll(".sf-view-status span")[1]?.textContent;
		expect(statusLabel()).toBe("Active");

		(card(tab.containerEl).querySelector('[role="switch"]') as HTMLElement).click();
		await vi.waitFor(() => expect(statusLabel()).toBe("Disabled"));
	});
});

// ---------------------------------------------------------------------------
// Edit action — command reconcile (unchanged behaviour, driven via ⋯ menu)
// ---------------------------------------------------------------------------

describe("SettingsTab — Edit action reconcile", () => {
	let app: App;
	beforeEach(() => {
		app = makeApp();
		vi.restoreAllMocks();
	});

	function clickEdit(container: HTMLElement): void {
		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Edit (rename & command)…");
		(entry as { onClickFn?: () => void }).onClickFn?.();
	}

	it("Edit Done with registerCommand:true writes label+commandLabel and registers with the COMMAND name", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, command: false, commandName: "Old Label" }) });
		const registerCommand = vi.fn();
		const removeCommand = vi.fn();
		const setRecordSpy = vi.spyOn(store, "setRecord");
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue({ label: "New Tab", registerCommand: true, commandName: "New Command" });

		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter(), registerCommand, removeCommand));
		clickEdit(container);

		await vi.waitFor(() =>
			expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({
				commandName: "New Tab",
				command: true,
				commandLabel: "New Command",
			})),
		);
		await vi.waitFor(() => expect(registerCommand).toHaveBeenCalledWith("v1", "New Command"));
		expect(registerCommand).not.toHaveBeenCalledWith("v1", "New Tab");
	});

	it("Edit with registerCommand:false removes the command unconditionally (stale record.command)", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, command: false, commandName: "Stale Record" }) });
		const registerCommand = vi.fn();
		const removeCommand = vi.fn();
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue({ label: "Stale Record", registerCommand: false, commandName: "Stale Record" });

		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter(), registerCommand, removeCommand));
		clickEdit(container);

		await vi.waitFor(() => expect(removeCommand).toHaveBeenCalledWith("v1"));
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("Edit cancelled (present resolves null) does not write the store or touch commands", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: true, command: false, commandName: "Unchanged" }) });
		const registerCommand = vi.fn();
		const removeCommand = vi.fn();
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const presentSpy = vi.spyOn(BindModal.prototype, "present").mockResolvedValue(null);

		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter(), registerCommand, removeCommand));
		clickEdit(container);

		await vi.waitFor(() => expect(presentSpy).toHaveBeenCalled());
		await Promise.resolve();
		await Promise.resolve();
		expect(setRecordSpy).not.toHaveBeenCalled();
		expect(removeCommand).not.toHaveBeenCalled();
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("Edit seeds the command-name input from commandLabel over the tab-label commandName", async () => {
		const store = makeStore({
			v1: makeRecord({ enabled: true, command: true, commandName: "Existing Tab", commandLabel: "Existing Cmd Label" }),
		});
		let seededCommandName: string | undefined;
		vi.spyOn(BindModal.prototype, "present").mockImplementation(function (this: BindModal) {
			seededCommandName = (this as unknown as { seed: { commandName?: string } }).seed.commandName;
			return Promise.resolve(null);
		});

		const container = await renderTab(makeTab(app, store, makeGateWithDecision("consented"), makeImporter()));
		clickEdit(container);

		await vi.waitFor(() => expect(seededCommandName).toBeDefined());
		expect(seededCommandName).toBe("Existing Cmd Label");
	});

	it("Remove does not call any vault write API", async () => {
		const store = makeStore({ v1: makeRecord({ enabled: false, commandName: "Remove Me" }) });
		const container = await renderTab(makeTab(app, store, makeConsentGate(), makeImporter()));

		const menu = openRowMenu(card(container));
		const entry = menu._entries.find((e) => e.kind === "item" && e.title === "Remove");
		(entry as { onClickFn?: () => void }).onClickFn?.();

		await vi.waitFor(() => expect(app.vault.modify).not.toHaveBeenCalled());
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(app.vault.delete).not.toHaveBeenCalled();
		expect(app.vault.trash).not.toHaveBeenCalled();
	});
});
