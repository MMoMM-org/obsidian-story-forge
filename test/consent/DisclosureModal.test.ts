/**
 * Tests for DisclosureModal + ConsentGate.requestConsent / requestReConsent (T1.4).
 *
 * SDD/T1.4 requirements:
 * - DataviewJS full-disclosure modal (S20/S23): shows name, description, source path,
 *   full source in scrollable block, sha256 checksum.
 * - Cancel button is the FIRST button in DOM order (default-focused / safe default, ADR-5).
 * - Clicking "Enable" returns true; calls store.setRecord with okayed:{version,checksum}+enabled:true
 *   in ONE call.
 * - Clicking Cancel returns false; NO write to store.
 * - DQL light confirm (S21): shows name + "declarative, read-only" message; no JS warning.
 * - Re-consent modal (S23): same full-disclosure structure as S20 for DataviewJS.
 * - No innerHTML with untrusted data (XSS-safe: all via createEl/textContent).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, TFile } from "obsidian";
import { ConsentGate } from "consent/ConsentGate";
import type { EngineRegistryLike, DvSettingsReader } from "consent/ConsentGate";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import { computeChecksum } from "consent/checksum";

// ---------------------------------------------------------------------------
// Platform mock
// ---------------------------------------------------------------------------

vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	return {
		...actual,
		Platform: { isMobile: false, isDesktop: true },
	};
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeRegistry(): EngineRegistryLike {
	return { get: vi.fn(() => ({})) };
}

function makeDvSettings(enabled = true): DvSettingsReader {
	return { isDvJsEnabled: vi.fn(() => enabled) };
}

function makeStore(): { store: ViewStore; setRecord: ReturnType<typeof vi.fn> } {
	const setRecord = vi.fn(async () => {});
	const store = {
		getViews: vi.fn(async () => ({})),
		setRecord,
		deleteRecord: vi.fn(async () => {}),
	} as unknown as ViewStore;
	return { store, setRecord };
}

const DV_JS_BODY = "dv.list(dv.pages())\n";
const DV_JS_CONTENT = "# View\n\n```dataviewjs\n" + DV_JS_BODY + "```\n";

const DQL_BODY = "LIST FROM #canon\n";
const DQL_CONTENT = "# View\n\n```dataview\n" + DQL_BODY + "```\n";

function makeAppWithFile(path: string, content: string, sfVersion = 1): App {
	const app = new App();
	const file = new TFile();
	file.path = path;
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
		p === path ? file : null,
	);
	vi.mocked(app.vault.read).mockResolvedValue(content);
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
		frontmatter: { "sf-version": sfVersion },
	});
	return app;
}

function makeRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: null,
		source: "views/my-view.md",
		engine: "dataviewjs",
		command: false,
		commandName: "Characters in Scene",
		description: "Lists pov + characters of the active scene note",
		...overrides,
	};
}

/**
 * Find a button by its label text.
 */
function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	const buttons = root.querySelectorAll("button");
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

/**
 * Wait until a button with the given label appears in document.body,
 * then return it. Uses vi.waitFor to poll across async boundaries.
 */
async function waitForButton(label: string): Promise<HTMLButtonElement> {
	return vi.waitFor(
		() => {
			const btn = findButton(document.body, label);
			if (!btn) throw new Error(`Button "${label}" not found`);
			return btn;
		},
		{ timeout: 2000, interval: 10 },
	);
}

// ---------------------------------------------------------------------------
// Tests: requestConsent — DataviewJS (S20)
// ---------------------------------------------------------------------------

describe("ConsentGate.requestConsent — DataviewJS (S20)", () => {
	let app: App;
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;

	beforeEach(() => {
		vi.clearAllMocks();
		app = makeAppWithFile("views/my-view.md", DV_JS_CONTENT);
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("Cancel returns false and does not call store.setRecord", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);

		const cancelBtn = await waitForButton("Cancel");
		cancelBtn.click();

		const result = await promise;
		expect(result).toBe(false);
		expect(setRecord).not.toHaveBeenCalled();
	});

	it("modal content includes view name", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs", commandName: "Characters in Scene" });

		const promise = gate.requestConsent("id-1", record);
		await waitForButton("Cancel");

		expect(document.body.textContent).toContain("Characters in Scene");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("modal content includes source path", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs", source: "views/my-view.md" });

		const promise = gate.requestConsent("id-1", record);
		await waitForButton("Cancel");

		expect(document.body.textContent).toContain("views/my-view.md");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("modal content includes the DataviewJS source code", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);
		await waitForButton("Cancel");

		expect(document.body.textContent).toContain("dv.list(dv.pages())");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("modal content includes sha256: checksum", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);
		await waitForButton("Cancel");

		expect(document.body.textContent).toContain("sha256:");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("Cancel is the FIRST button in DOM order (safe default per ADR-5 / S20)", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);
		await waitForButton("Cancel");

		const buttons = document.body.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThanOrEqual(2);
		expect(buttons[0]?.textContent?.trim()).toBe("Cancel");

		(buttons[0] as HTMLElement).click();
		await promise;
	});

	it("Enable returns true and calls store.setRecord with okayed+enabled in ONE call", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();

		const result = await promise;
		expect(result).toBe(true);

		expect(setRecord).toHaveBeenCalledTimes(1);
		const [calledId, calledRecord] = setRecord.mock.calls[0] as [string, ViewRecord];
		expect(calledId).toBe("id-1");
		expect(calledRecord.enabled).toBe(true);
		expect(calledRecord.okayed).not.toBeNull();
		expect(calledRecord.okayed!.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(typeof calledRecord.okayed!.version).toBe("number");
	});

	it("Enable writes the CORRECT checksum matching fresh block body", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataviewjs" });

		const promise = gate.requestConsent("id-1", record);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();
		await promise;

		const expectedChecksum = await computeChecksum(DV_JS_BODY);
		const [, calledRecord] = setRecord.mock.calls[0] as [string, ViewRecord];
		expect(calledRecord.okayed!.checksum).toBe(expectedChecksum);
	});
});

// ---------------------------------------------------------------------------
// Tests: requestConsent — DQL (S21)
// ---------------------------------------------------------------------------

describe("ConsentGate.requestConsent — DQL (S21)", () => {
	let app: App;
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;

	beforeEach(() => {
		vi.clearAllMocks();
		app = makeAppWithFile("views/my-view.md", DQL_CONTENT);
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("DQL modal shows 'declarative' or 'read-only' note", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataview-dql" });

		const promise = gate.requestConsent("id-dql", record);
		await waitForButton("Cancel");

		expect(document.body.textContent?.toLowerCase()).toMatch(/declarative|read-only/);

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("DQL modal does NOT show the JavaScript vault-access warning", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataview-dql" });

		const promise = gate.requestConsent("id-dql", record);
		await waitForButton("Cancel");

		// ADR-5 Rule 3: DQL never shows full disclosure
		expect(document.body.textContent).not.toContain("vault access");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("DQL Enable returns true and writes setRecord", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataview-dql" });

		const promise = gate.requestConsent("id-dql", record);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();

		const result = await promise;
		expect(result).toBe(true);
		expect(setRecord).toHaveBeenCalledTimes(1);

		const [, calledRecord] = setRecord.mock.calls[0] as [string, ViewRecord];
		expect(calledRecord.enabled).toBe(true);
		expect(calledRecord.okayed!.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("DQL Cancel returns false and does not write", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({ engine: "dataview-dql" });

		const promise = gate.requestConsent("id-dql", record);
		const cancelBtn = await waitForButton("Cancel");
		cancelBtn.click();

		const result = await promise;
		expect(result).toBe(false);
		expect(setRecord).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Tests: requestReConsent — DataviewJS (S23)
// ---------------------------------------------------------------------------

describe("ConsentGate.requestReConsent — DataviewJS (S23)", () => {
	let app: App;
	let registry: EngineRegistryLike;
	let dvSettings: DvSettingsReader;

	beforeEach(() => {
		vi.clearAllMocks();
		app = makeAppWithFile("views/my-view.md", DV_JS_CONTENT);
		registry = makeRegistry();
		dvSettings = makeDvSettings(true);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("re-consent modal shows source code (same full disclosure as S20)", async () => {
		const { store } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({
			engine: "dataviewjs",
			okayed: { version: 1, checksum: "sha256:" + "0".repeat(64) },
		});

		const promise = gate.requestReConsent("id-1", record);
		await waitForButton("Cancel");

		expect(document.body.textContent).toContain("dv.list(dv.pages())");

		findButton(document.body, "Cancel")?.click();
		await promise;
	});

	it("re-consent Enable returns true and writes setRecord", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({
			engine: "dataviewjs",
			okayed: { version: 1, checksum: "sha256:" + "0".repeat(64) },
		});

		const promise = gate.requestReConsent("id-1", record);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();

		const result = await promise;
		expect(result).toBe(true);
		expect(setRecord).toHaveBeenCalledTimes(1);
	});

	it("re-consent Cancel returns false and does not write", async () => {
		const { store, setRecord } = makeStore();
		const gate = new ConsentGate(app, registry, dvSettings, store);
		const record = makeRecord({
			engine: "dataviewjs",
			okayed: { version: 1, checksum: "sha256:" + "0".repeat(64) },
		});

		const promise = gate.requestReConsent("id-1", record);
		const cancelBtn = await waitForButton("Cancel");
		cancelBtn.click();

		const result = await promise;
		expect(result).toBe(false);
		expect(setRecord).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// XSS safety: no innerHTML with untrusted data
// ---------------------------------------------------------------------------

describe("XSS safety", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("source code containing HTML tags is rendered as text, not injected as HTML", async () => {
		const maliciousBody = '<script>alert("xss")</script>\n';
		const maliciousContent =
			"# View\n\n```dataviewjs\n" + maliciousBody + "```\n";
		const app = makeAppWithFile("views/xss.md", maliciousContent);
		const { store } = makeStore();
		const gate = new ConsentGate(app, makeRegistry(), makeDvSettings(), store);
		const record = makeRecord({ engine: "dataviewjs", source: "views/xss.md" });

		const promise = gate.requestConsent("id-xss", record);
		const cancelBtn = await waitForButton("Cancel");

		// The <script> tag must NOT be present as a live executable element
		const scripts = document.body.querySelectorAll("script");
		expect(scripts.length).toBe(0);

		// The literal text must appear as text content (textContent shows it escaped)
		expect(document.body.textContent).toContain('<script>alert("xss")</script>');

		cancelBtn.click();
		await promise;
	});
});
