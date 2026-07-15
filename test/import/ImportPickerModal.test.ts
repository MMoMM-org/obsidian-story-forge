/**
 * Tests for ImportPickerModal (T4.3) — import picker + bind modal.
 *
 * SDD/Flow C: scanVault → picker → parse → importToStore → bind → tab.
 * PRD AC-F3.1, AC-F3.3, AC-F3.4, AC-F3.6, AC-F3.7.
 *
 * Test strategy:
 * - ImportPickerModal: lists TFile results from scanVault(); on confirm: parse
 *   then importToStore in that order; shows errors inline without closing; on
 *   success closes and opens BindModal.
 * - BindModal: pre-fills label from def.name; checkbox for command registration;
 *   cancel: no rollback (view stays in store); confirm with command: calls
 *   registerCommand callback; confirm without: does not call it.
 *   On confirm: persists the tab label to ViewRecord.commandName via setRecord.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ImportPickerModal } from "import/ImportPickerModal";
import { BindModal } from "import/BindModal";
import { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

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

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("lists all TFile objects returned by scanVault()", async () => {
		const file1 = makeFile("views/a.md", "View A");
		const file2 = makeFile("views/b.md", "View B");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file1, file2]);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("View A");
			expect(document.body.textContent).toContain("View B");
		});
	});

	it("shows an empty state message when scanVault() returns no files", async () => {
		vi.spyOn(importer, "scanVault").mockResolvedValue([]);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/no.*view|nothing to import/i);
		});
	});

	it("shows file paths in the list", async () => {
		const file = makeFile("_forge/views/characters-in-scene.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("_forge/views/characters-in-scene.md");
		});
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — confirm: parse then importToStore order
// ---------------------------------------------------------------------------

describe("ImportPickerModal — confirm calls parse then importToStore in order", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("calls parse before importToStore (order enforced)", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		const callOrder: string[] = [];

		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockImplementation(async () => {
			callOrder.push("parse");
			return def;
		});
		vi.spyOn(importer, "importToStore").mockImplementation(async () => {
			callOrder.push("importToStore");
			return "new-id";
		});

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		// Select the file and confirm
		await waitForButton("Next →");
		const nextBtn = findButton(document.body, "Next →")!;
		nextBtn.click();

		await vi.waitFor(() => {
			expect(callOrder).toEqual(["parse", "importToStore"]);
		});
	});

	it("calls parse with the selected file", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		const parseSpy = vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "importToStore").mockResolvedValue("new-id");

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(parseSpy).toHaveBeenCalledWith(file);
		});
	});

	it("calls importToStore with the parsed definition", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		const importSpy = vi.spyOn(importer, "importToStore").mockResolvedValue("new-id");

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(importSpy).toHaveBeenCalledWith(def);
		});
	});
});

// ---------------------------------------------------------------------------
// ImportPickerModal — parse error handling
// ---------------------------------------------------------------------------

describe("ImportPickerModal — parse error handling (inline, no close)", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
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

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
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

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
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

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("No query block found");
		});

		expect(closeSpy).not.toHaveBeenCalled();
	});

	it("does NOT call importToStore when parse throws", async () => {
		const file = makeFile("views/bad.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(
			new ImportError("NO_QUERY_BLOCK", "No query block found"),
		);
		const importSpy = vi.spyOn(importer, "importToStore");

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("No query block found");
		});

		expect(importSpy).not.toHaveBeenCalled();
	});

	// W1: non-ImportError from parse shows "Import failed: unexpected error" and keeps modal open
	it("shows 'Import failed: unexpected error' and does NOT close when parse throws a plain Error", async () => {
		const file = makeFile("views/bad.md");
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockRejectedValue(new Error("disk full"));

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
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
// ImportPickerModal — importToStore duplicate error
// ---------------------------------------------------------------------------

describe("ImportPickerModal — importToStore duplicate error", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows 'already imported' message when importToStore throws DUPLICATE", async () => {
		const file = makeFile("views/dupe.md");
		const def = makeDef({ sourcePath: "views/dupe.md" });
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "importToStore").mockRejectedValue(
			new ImportError("DUPLICATE", "View already imported"),
		);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("already imported");
		});
	});

	it("does NOT close the modal when importToStore throws DUPLICATE", async () => {
		const file = makeFile("views/dupe.md");
		const def = makeDef({ sourcePath: "views/dupe.md" });
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "importToStore").mockRejectedValue(
			new ImportError("DUPLICATE", "View already imported"),
		);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("already imported");
		});

		expect(closeSpy).not.toHaveBeenCalled();
	});

	// W1: non-ImportError from importToStore shows "Import failed: unexpected error" and keeps modal open
	it("shows 'Import failed: unexpected error' and does NOT close when importToStore throws a plain Error", async () => {
		const file = makeFile("views/bad2.md");
		const def = makeDef({ sourcePath: "views/bad2.md" });
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "importToStore").mockRejectedValue(new Error("disk full"));

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
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
// ImportPickerModal — success path: closes and opens BindModal
// ---------------------------------------------------------------------------

describe("ImportPickerModal — success path", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("closes the picker modal after successful import", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "importToStore").mockResolvedValue("new-id");

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		await vi.waitFor(() => {
			expect(closeSpy).toHaveBeenCalled();
		});
	});

	it("opens BindModal after successful import (BindModal title appears)", async () => {
		const file = makeFile("views/chars.md");
		const def = makeDef();
		vi.spyOn(importer, "scanVault").mockResolvedValue([file]);
		vi.spyOn(importer, "parse").mockResolvedValue(def);
		vi.spyOn(importer, "importToStore").mockResolvedValue("new-id");

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await waitForButton("Next →");
		findButton(document.body, "Next →")!.click();

		// BindModal should appear with def.name
		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("Characters in Scene");
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

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
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

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
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

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
		importer = makeImporter(app, store);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("Next → is disabled when scanVault() returns no files", async () => {
		vi.spyOn(importer, "scanVault").mockResolvedValue([]);

		const modal = new ImportPickerModal(app, importer, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			const nextBtn = findButton(document.body, "Next →") as HTMLButtonElement | null;
			expect(nextBtn).not.toBeNull();
			expect(nextBtn?.disabled).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// BindModal — pre-fills sf-name as tab label
// ---------------------------------------------------------------------------

describe("BindModal — pre-fills tab label from def.name (ADR-6)", () => {
	let app: App;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("tab label input is pre-filled with def.name", async () => {
		const def = makeDef({ name: "Characters in Scene" });
		const modal = new BindModal(app, "view-id", def, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			const inputs = document.body.querySelectorAll("input[type=text]");
			const labelInput = Array.from(inputs).find(
				(el) => (el as HTMLInputElement).value === "Characters in Scene",
			) as HTMLInputElement | undefined;
			expect(labelInput).toBeDefined();
			expect(labelInput?.value).toBe("Characters in Scene");
		});
	});

	it("shows the view name in the modal content", async () => {
		const def = makeDef({ name: "My Custom View" });
		const modal = new BindModal(app, "view-id", def, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("My Custom View");
		});
	});
});

// ---------------------------------------------------------------------------
// BindModal — command registration checkbox
// ---------------------------------------------------------------------------

describe("BindModal — command registration checkbox", () => {
	let app: App;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("offers a checkbox for command palette registration", async () => {
		const def = makeDef();
		const modal = new BindModal(app, "view-id", def, store, vi.fn());
		modal.open();

		await vi.waitFor(() => {
			const checkboxes = document.body.querySelectorAll("input[type=checkbox]");
			expect(checkboxes.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("does NOT call registerCommand when command checkbox is unchecked on confirm", async () => {
		const def = makeDef();
		const registerCommand = vi.fn();
		const modal = new BindModal(app, "view-id", def, store, registerCommand);
		modal.open();

		// Ensure the command checkbox is unchecked (default or explicitly unchecked)
		await vi.waitFor(() => {
			const checkboxes = document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
			for (const cb of checkboxes) {
				if (cb.dataset["role"] === "command" || cb.closest("[data-role=command]")) {
					cb.checked = false;
				}
			}
			return checkboxes.length > 0;
		});

		await waitForButton("Done");
		findButton(document.body, "Done")!.click();

		// S1: replace empty waitFor with a meaningful condition
		await vi.waitFor(() => expect(registerCommand).not.toHaveBeenCalled());
	});

	it("calls registerCommand(id, commandName) when command checkbox is checked on confirm", async () => {
		const def = makeDef({ name: "Characters in Scene" });
		const registerCommand = vi.fn();
		const modal = new BindModal(app, "view-id", def, store, registerCommand);
		modal.open();

		// Check the command checkbox
		await vi.waitFor(() => {
			const checkboxes = document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
			const commandCb = Array.from(checkboxes).find(
				(cb) => cb.dataset["role"] === "command",
			);
			if (!commandCb) throw new Error("command checkbox not found");
			if (!commandCb.checked) {
				commandCb.click();
			}
		});

		await waitForButton("Done");
		findButton(document.body, "Done")!.click();

		await vi.waitFor(() => {
			expect(registerCommand).toHaveBeenCalledWith("view-id", expect.any(String));
		});
	});

	it("registerCommand receives the view id as first argument", async () => {
		const def = makeDef();
		const registerCommand = vi.fn();
		const modal = new BindModal(app, "my-view-id", def, store, registerCommand);
		modal.open();

		// Check the command checkbox
		await vi.waitFor(() => {
			const checkboxes = document.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
			const commandCb = Array.from(checkboxes).find(
				(cb) => cb.dataset["role"] === "command",
			);
			if (!commandCb) throw new Error("command checkbox not found");
			if (!commandCb.checked) commandCb.click();
		});

		await waitForButton("Done");
		findButton(document.body, "Done")!.click();

		await vi.waitFor(() => {
			expect(registerCommand).toHaveBeenCalledWith("my-view-id", expect.any(String));
		});
	});
});

// ---------------------------------------------------------------------------
// BindModal — S5: confirm persists tab label to ViewRecord.commandName
// ---------------------------------------------------------------------------

describe("BindModal — confirm persists tab label to store (S5)", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("calls store.setRecord with the default tab label (def.name) when Done is clicked", async () => {
		const existingRecord: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: "views/chars.md",
			engine: "dataviewjs",
			command: false,
		};
		const store = makeStore({ "view-id": existingRecord });
		const setRecordSpy = vi.spyOn(store, "setRecord");

		const def = makeDef({ name: "Characters in Scene" });
		const modal = new BindModal(app, "view-id", def, store, vi.fn());
		modal.open();

		await waitForButton("Done");
		findButton(document.body, "Done")!.click();

		await vi.waitFor(() => {
			expect(setRecordSpy).toHaveBeenCalledWith(
				"view-id",
				expect.objectContaining({ commandName: "Characters in Scene" }),
			);
		});
	});

	it("persists the user-edited tab label when Done is clicked with a modified value", async () => {
		const existingRecord: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: "views/chars.md",
			engine: "dataviewjs",
			command: false,
		};
		const store = makeStore({ "view-id": existingRecord });
		const setRecordSpy = vi.spyOn(store, "setRecord");

		const def = makeDef({ name: "Characters in Scene" });
		const modal = new BindModal(app, "view-id", def, store, vi.fn());
		modal.open();

		// Edit the tab label
		await vi.waitFor(() => {
			const inputs = document.body.querySelectorAll<HTMLInputElement>("input[type=text]");
			const tabInput = Array.from(inputs).find(
				(el) => el.value === "Characters in Scene",
			);
			if (!tabInput) throw new Error("tab label input not found");
			tabInput.value = "My Custom Label";
			// Dispatch input event so the modal tracks the change
			tabInput.dispatchEvent(new Event("input"));
		});

		await waitForButton("Done");
		findButton(document.body, "Done")!.click();

		await vi.waitFor(() => {
			expect(setRecordSpy).toHaveBeenCalledWith(
				"view-id",
				expect.objectContaining({ commandName: "My Custom Label" }),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// BindModal — cancel: no rollback, view stays in store
// ---------------------------------------------------------------------------

describe("BindModal — cancel: no rollback", () => {
	let app: App;
	let store: ViewStore;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		store = makeStore();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("cancel closes the bind modal without calling registerCommand", async () => {
		const def = makeDef();
		const registerCommand = vi.fn();
		const modal = new BindModal(app, "view-id", def, store, registerCommand);
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Back");
		findButton(document.body, "Back")!.click();

		await vi.waitFor(() => {
			expect(closeSpy).toHaveBeenCalled();
		});

		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("cancel does not delete the view from store (no rollback per SDD)", async () => {
		const existingRecord: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: "views/chars.md",
			engine: "dataviewjs",
			command: false,
		};
		// Pre-populate store — simulates that importToStore already ran
		const populatedStore = makeStore({ "view-id": existingRecord });
		const deleteRecordSpy = vi.spyOn(populatedStore, "deleteRecord");

		const def = makeDef();
		const modal = new BindModal(app, "view-id", def, populatedStore, vi.fn());
		modal.open();

		await waitForButton("Back");
		findButton(document.body, "Back")!.click();

		await vi.waitFor(() => {
			expect(deleteRecordSpy).not.toHaveBeenCalled();
		});
	});
});
