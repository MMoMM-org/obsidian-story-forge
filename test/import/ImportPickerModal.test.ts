/**
 * Tests for ImportPickerModal (T4.3, rewired T-S2.4) — vault view picker.
 *
 * SDD/Flow C: scanVault → picker → parse → (delegate to runImportFlow).
 * PRD AC-F3.1, AC-F3.3, AC-F3.4.
 *
 * Test strategy:
 * - ImportPickerModal: lists TFile results from scanVault(); on confirm it
 *   PARSES the selected file; parse errors stay shown inline WITHOUT closing and
 *   WITHOUT starting the flow; on a successful parse it closes and delegates to
 *   runImportFlow. The picker no longer imports/commits itself — the flow does.
 * - The flow's first step (gate.requestConsentForDef) is spied on to prove the
 *   flow was (or was not) started, and to short-circuit it (null → abort) so no
 *   real consent/bind modals open during the picker tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ImportPickerModal } from "import/ImportPickerModal";
import { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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

function makeFile(path: string, basename?: string): TFile {
	return createMockTFile({
		path,
		basename: basename ?? path.split("/").pop()!.replace(/\.md$/, ""),
		name: path.split("/").pop()!,
	});
}

function makeDef(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: "views/chars.md",
		engine: "dataviewjs",
		version: 1,
		name: "Characters in Scene",
		description: "Lists characters",
		command: false,
		querySource: "dv.list(dv.pages())\n",
		checksum: "sha256:" + "a".repeat(64) as `sha256:${string}`,
		...overrides,
	};
}

function makeImporter(app: App, store: ViewStore): ViewImporter {
	return new ViewImporter(app, store);
}

/**
 * A ConsentGate mock whose only used method is requestConsentForDef — the
 * flow's first step. Default: resolves null so the flow aborts before opening
 * any real consent/bind modal. Tests spy on it to prove the flow started.
 */
function makeGate(): ConsentGate {
	return {
		requestConsentForDef: vi.fn(async () => null),
	} as unknown as ConsentGate;
}

/**
 * Find a button by its label text within a root element.
 */
function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	const buttons = root.querySelectorAll("button");
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

/**
 * Wait until a button with the given label appears in document.body.
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
// ImportPickerModal — listing
// ---------------------------------------------------------------------------

describe("ImportPickerModal — file listing", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("lists all TFile objects returned by scanVault()", async () => {
		const file1 = makeFile("views/a.md", "View A");
		const file2 = makeFile("views/b.md", "View B");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file1, file2]);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("View A");
			expect(document.body.textContent).toContain("View B");
		});
	});

	it("shows an empty state message when scanVault() returns no files", async () => {
		vi.spyOn(importer, "scanVault").mockResolvedValue([]);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/no.*view|nothing to import/i);
		});
	});

	it("shows file paths in the list", async () => {
		const file = makeFile("_forge/views/characters-in-scene.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("_forge/views/characters-in-scene.md");
		});
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — confirm: parse then delegate to runImportFlow
// ---------------------------------------------------------------------------

describe("ImportPickerModal — confirm parses then starts the flow", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("calls parse with the selected file", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		const parseSpy = vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(parseSpy).toHaveBeenCalledWith(file);
		});
	});

	it("starts the flow (gate.requestConsentForDef) with the parsed def, and does NOT importToStore itself", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		const importSpy = vi.spyOn(importer, "importToStore");

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		// The flow's first step is invoked with the parsed def (gate → null → abort).
		await vi.waitFor(() => {
			expect(gate.requestConsentForDef).toHaveBeenCalledWith(def);
		});
		// The picker must NOT commit — that is deferred to the flow's end.
		expect(importSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — parse error handling
// ---------------------------------------------------------------------------

describe("ImportPickerModal — parse error handling (inline, no close)", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows 'No query block found' when parse throws NO_QUERY_BLOCK", async () => {
		const file = makeFile("views/no-block.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(
			new ImportError("NO_QUERY_BLOCK", "No query block found"),
		);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("No query block found");
		});
	});

	it("shows 'exactly one query block' message when parse throws MULTIPLE_QUERY_BLOCKS", async () => {
		const file = makeFile("views/multi.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(
			new ImportError(
				"MULTIPLE_QUERY_BLOCKS",
				"View definitions must contain exactly one query block",
			),
		);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain(
				"View definitions must contain exactly one query block",
			);
		});
	});

	it("does NOT close the modal when parse throws an ImportError", async () => {
		const file = makeFile("views/bad.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(
			new ImportError("NO_QUERY_BLOCK", "No query block found"),
		);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("No query block found");
		});

		expect(closeSpy).not.toHaveBeenCalled();
	});

	it("does NOT start the flow (gate.requestConsentForDef) when parse throws", async () => {
		const file = makeFile("views/bad.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(
			new ImportError("NO_QUERY_BLOCK", "No query block found"),
		);
		const importSpy = vi.spyOn(importer, "importToStore");

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("No query block found");
		});

		// Parse error stays inline: the flow is not started and nothing is committed.
		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		expect(importSpy).not.toHaveBeenCalled();
	});

	// W1: non-ImportError from parse shows "Import failed: unexpected error" and keeps modal open
	it("shows 'Import failed: unexpected error' and does NOT close when parse throws a plain Error", async () => {
		const file = makeFile("views/bad.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(new Error("disk full"));

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("Import failed: unexpected error");
		});
		expect(closeSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — success path: closes and delegates to the flow
// ---------------------------------------------------------------------------

describe("ImportPickerModal — success path", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("closes the picker modal after a successful parse", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(closeSpy).toHaveBeenCalled();
		});
	});

	it("starts the flow (gate.requestConsentForDef) after a successful parse", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(gate.requestConsentForDef).toHaveBeenCalledWith(def);
		});
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — W2 lifecycle: closed before scanVault resolves
// ---------------------------------------------------------------------------

describe("ImportPickerModal — lifecycle guard (W2)", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("renders no rows and does not throw when modal is closed before scanVault resolves", async () => {
		// scanVault never resolves during test
		let resolveScan!: (files: TFile[]) => void;
		vi.spyOn(importer, "scanVault").mockReturnValue(
			new Promise<TFile[]>((res) => { resolveScan = res; }),
		);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		// Close immediately (before scan resolves)
		modal.close();

		// Now resolve the scan — the guard should prevent DOM writes
		resolveScan([makeFile("views/a.md")]);

		// Give any microtasks a chance to settle
		await vi.waitFor(() => {
			// No rows should have been rendered (modal was closed)
			const rows = document.body.querySelectorAll(".sf-picker-row");
			expect(rows.length).toBe(0);
		});
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — W3: empty list disables Next →
// ---------------------------------------------------------------------------

describe("ImportPickerModal — empty list disables Next → (W3)", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;
	let gate: ConsentGate;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
		gate = makeGate();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("Next → is disabled when scanVault() returns no files", async () => {
		vi.spyOn(importer, "scanVault").mockResolvedValue([]);

		const modal = new ImportPickerModal(app, importer, gate, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			const nextBtn = findButton(document.body, "Next →") as HTMLButtonElement | null;
			expect(nextBtn).not.toBeNull();
			expect(nextBtn?.disabled).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// NOTE (T-S2.4): the picker now PARSES then delegates to runImportFlow — it no
// longer imports/commits or opens BindModal itself. The consent → bind → commit
// → registerCommand sequence (incl. the DUPLICATE-race Notice) is covered by
// test/import/ImportFlow.test.ts. BindModal's own pure-UI contract tests live in
// test/import/BindModal.test.ts. The picker tests here cover only listing, the
// parse step, inline parse errors (flow NOT started), and the delegation
// hand-off (close + flow started) on a successful parse.
// ---------------------------------------------------------------------------
