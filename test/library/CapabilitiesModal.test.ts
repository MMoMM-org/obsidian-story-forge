/**
 * CapabilitiesModal + the first-run trigger (spec 008 T7.4, PRD F8, ADR-36;
 * mockups-capabilities.html L12a–c, S1/S3/S4).
 *
 * - The modal draws one row per optional plugin with its kind and live status; community rows have
 *   no action; the core row names where it lives, as text.
 * - First run: "Got it" and a footer pointer; any close dismisses it for good. From settings:
 *   only "Close", and closing it changes nothing.
 * - The trigger opens it once, the first time the Anvil or the Workbench opens after layout is
 *   ready (never at plugin load), and never again once dismissed.
 * - No-nag guard: the Anvil's state for a Dataview collection without Dataview prompts nothing.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { CapabilitiesModal } from "library/CapabilitiesModal";
import { CAPABILITIES_HINT_ID, createCapabilitiesTrigger } from "library/capabilitiesTrigger";
import type { CapabilityFacts } from "library/capabilityReport";
import { CollectionEmbed } from "anvil/collectionEmbed";
import type { ViewRecord } from "store/types";

const L12A: CapabilityFacts = {
	bases: "enabled",
	dataview: { active: false, jsEnabled: false },
	fileClasses: { count: 9, folder: "00 Meta/FileClasses" },
};

const L12B: CapabilityFacts = {
	bases: "disabled",
	dataview: { active: true, jsEnabled: false },
	fileClasses: { count: 9, folder: "00 Meta/FileClasses" },
};

function open(mode: "first-run" | "settings", facts: CapabilityFacts = L12A, onDismiss = vi.fn()) {
	const modal = new CapabilitiesModal(new App(), { getFacts: () => facts, mode, onDismiss });
	modal.open();
	return { modal, onDismiss };
}

function rowEl(name: string): HTMLElement {
	const r = Array.from(document.body.querySelectorAll<HTMLElement>(".sf-cap-row"))
		.find((x) => x.querySelector(".sf-cap-name")?.textContent === name);
	if (!r) throw new Error(`no row ${name}`);
	return r;
}

function footButtons(): string[] {
	return Array.from(document.body.querySelectorAll(".sf-picker-foot button")).map((b) => b.textContent ?? "");
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("CapabilitiesModal — what it shows (L12a/b)", () => {
	it("draws the title, the intro and one row per plugin under its group", () => {
		const { modal } = open("first-run");
		expect(document.body.querySelector("h2")?.textContent).toBe("What optional plugins add");
		expect(document.body.querySelector(".sf-cap-intro")?.textContent)
			.toBe("Story Forge works without any of these. Each row says what it adds and what you have without it.");
		expect(Array.from(document.body.querySelectorAll(".sf-cap-grp")).map((g) => g.textContent)).toEqual([
			"Core plugin · ships with Obsidian",
			"Community plugins · installed separately, never required",
		]);
		expect(Array.from(document.body.querySelectorAll(".sf-cap-name")).map((n) => n.textContent))
			.toEqual(["Bases", "Dataview", "metadata-menu"]);
		expect(modal.modalEl.classList.contains("sf-cap-modal")).toBe(true);
	});

	it("each row shows its kind and its live status (L12a)", () => {
		open("first-run");
		const status = (n: string): [string | null, string] => {
			const s = rowEl(n).querySelector(".sf-cap-status")!;
			return [s.textContent, s.className];
		};
		expect(rowEl("Bases").querySelector(".sf-cap-kind")?.textContent).toBe("core");
		expect(rowEl("Bases").querySelector(".sf-cap-kind")?.classList.contains("is-core")).toBe(true);
		expect(rowEl("Dataview").querySelector(".sf-cap-kind")?.textContent).toBe("community");
		expect(status("Bases")).toEqual(["On", "sf-cap-status is-on"]);
		expect(status("Dataview")).toEqual(["Not active", "sf-cap-status is-off"]);
		expect(status("metadata-menu")).toEqual(["9 FileClasses in 00 Meta/FileClasses", "sf-cap-status"]);
	});

	it("reads the facts when it opens (L12b: Bases off, Dataview active with JavaScript off)", () => {
		open("settings", L12B);
		expect(rowEl("Bases").querySelector(".sf-cap-status")?.textContent).toBe("Off");
		expect(rowEl("Dataview").querySelector(".sf-cap-status")?.textContent).toBe("Active");
		expect(rowEl("Dataview").querySelector(".sf-cap-sub")?.textContent).toBe(
			"JavaScript queries (DataviewJS): Off in Dataview settings."
			+ "Without them, DataviewJS collections show \"DataviewJS disabled\" and do not run.",
		);
	});

	it("draws what it adds and what is lost without it, with `code` as code", () => {
		open("first-run");
		const cols = rowEl("Bases").querySelectorAll(".sf-cap-cols > div");
		expect(Array.from(cols).map((c) => c.querySelector("h5")?.textContent)).toEqual(["What it adds", "Without it"]);
		expect(cols[0]!.querySelectorAll("li")).toHaveLength(2);
		expect(cols[1]!.querySelectorAll("li")).toHaveLength(3);
		expect(cols[0]!.querySelector("li code")?.textContent).toBe(".base");
	});

	it("only the core row says where to turn it on, as text; community rows have no action at all (S4)", () => {
		open("first-run");
		expect(rowEl("Bases").querySelector(".sf-cap-how")?.textContent)
			.toBe("Ships with Obsidian. Turn it on in Settings › Core plugins › Bases.");
		for (const name of ["Bases", "Dataview", "metadata-menu"]) {
			expect(rowEl(name).querySelectorAll("button, a")).toHaveLength(0);
		}
		expect(rowEl("Dataview").querySelector(".sf-cap-how")).toBeNull();
		expect(rowEl("metadata-menu").querySelector(".sf-cap-how")).toBeNull();
		// "You can still import and install them" is the signed-off Without-it text, not a prompt.
		expect(document.body.textContent).not.toMatch(/install dataview|install metadata-menu|obsidian\.md\/plugins/i);
	});

	it("with everything absent, every row is still drawn (L12c)", () => {
		open("settings", { bases: "disabled", dataview: { active: false, jsEnabled: false }, fileClasses: { count: 0, folder: "00 Meta/FileClasses" } });
		expect(document.body.querySelectorAll(".sf-cap-row")).toHaveLength(3);
		expect(rowEl("metadata-menu").querySelector(".sf-cap-status")?.textContent).toBe("No FileClasses in 00 Meta/FileClasses");
	});
});

describe("CapabilitiesModal — closing (S1)", () => {
	it("first run: 'Got it' with the footer pointer, focused", () => {
		open("first-run");
		expect(footButtons()).toEqual(["Got it"]);
		expect(document.body.querySelector(".sf-cap-later")?.textContent)
			.toBe("Open this again from Settings › Library › What optional plugins add…");
		expect(activeDocument.activeElement?.textContent).toBe("Got it");
	});

	it.each([
		["Got it", (m: CapabilitiesModal) => { (Array.from(document.body.querySelectorAll<HTMLButtonElement>(".sf-picker-foot button")).find((b) => b.textContent === "Got it"))!.click(); void m; }],
		["✕ or Escape (Obsidian's own close)", (m: CapabilitiesModal) => { m.close(); }],
	] as const)("first run: closing by %s dismisses it", (_how, close) => {
		const { modal, onDismiss } = open("first-run");
		close(modal);
		expect(onDismiss).toHaveBeenCalledTimes(1);
		expect(document.body.querySelector(".sf-cap-row")).toBeNull();
	});

	it("from settings: only 'Close', focused; closing dismisses nothing", () => {
		const { modal, onDismiss } = open("settings");
		expect(footButtons()).toEqual(["Close"]);
		expect(document.body.querySelector(".sf-cap-later")).toBeNull();
		expect(activeDocument.activeElement?.textContent).toBe("Close");
		modal.close();
		expect(onDismiss).not.toHaveBeenCalled();
	});
});

describe("createCapabilitiesTrigger — once, on the first Anvil or Workbench open (S1)", () => {
	function harness(opts: { layoutReady?: boolean; dismissed?: string[] } = {}) {
		const dismissed = [...(opts.dismissed ?? [])];
		let layoutReady = opts.layoutReady ?? true;
		const openModal = vi.fn();
		const maybeShow = createCapabilitiesTrigger({
			isLayoutReady: () => layoutReady,
			isDismissed: () => dismissed.includes(CAPABILITIES_HINT_ID),
			open: openModal,
		});
		return { maybeShow, openModal, dismissed, setReady: (v: boolean): void => { layoutReady = v; } };
	}

	it("opens the first time a view opens after layout is ready", () => {
		const h = harness();
		h.maybeShow();
		expect(h.openModal).toHaveBeenCalledTimes(1);
	});

	it("does not open while the layout is still being restored (plugin load)", () => {
		const h = harness({ layoutReady: false });
		h.maybeShow();
		expect(h.openModal).not.toHaveBeenCalled();
		h.setReady(true);
		h.maybeShow();
		expect(h.openModal).toHaveBeenCalledTimes(1);
	});

	it("never opens once dismissed", () => {
		const h = harness({ dismissed: [CAPABILITIES_HINT_ID] });
		h.maybeShow();
		expect(h.openModal).not.toHaveBeenCalled();
	});

	it("opens once per session even before the dismissal is saved (the Anvil and the Workbench both opening)", () => {
		const h = harness();
		h.maybeShow();
		h.maybeShow();
		expect(h.openModal).toHaveBeenCalledTimes(1);
	});

	it("uses its own dismissedHints id, distinct from the Bases hint", () => {
		expect(CAPABILITIES_HINT_ID).toBe("capabilities");
	});
});

describe("No-nag guard — the Anvil (ADR-36, PRD F8 AC 5)", () => {
	it("a Dataview collection without Dataview says why and prompts nothing", async () => {
		const record: ViewRecord = {
			provenance: "imported", enabled: true, okayed: null, source: "90 Views/Skills.md",
			engine: "dataview-dql", command: false, kind: "collection", surfaces: { anvil: true, workbench: false },
		};
		const embed = new CollectionEmbed({
			getRecord: async () => record,
			gate: { evaluate: vi.fn(async () => ({ status: "engine-missing" as const })), requestConsent: vi.fn(), requestReConsent: vi.fn() },
			createEngine: () => undefined,
		});
		const host = document.createElement("div");
		document.body.appendChild(host);
		const file: TFile = createMockTFile({ path: "a.md" });
		await embed.draw(host, { collectionId: "skills", cardId: "hero", activeFile: file, openPath: null });
		expect(host.textContent).toContain("Dataview");
		expect(host.textContent).not.toMatch(/install/i);
		expect(host.querySelectorAll("a, button")).toHaveLength(0);
	});
});
