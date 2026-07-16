/**
 * Tests for runImportFlow (T-S2.4) — deferred-atomic one-flow import.
 *
 * SDD/Flow C: consent (no write) → bind (no write) → importToStore (single
 * commit) → registerCommand. Nothing is committed until the very end: cancelling
 * consent OR going Back at the bind step commits NOTHING.
 *
 * Test strategy:
 * - Mock gate.requestConsentForDef, importer.importToStore, registerCommand.
 * - Spy on BindModal.prototype.present to control the bind step (mirrors how
 *   ConsentGate.test.ts spies on DisclosureModal.prototype.present).
 * - Assert the exact importToStore opts ({okayed, enabled, commandName}) and
 *   registerCommand args, and that a DUPLICATE race surfaces a Notice.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice } from "../__mocks__/obsidian";
import { runImportFlow } from "import/ImportFlow";
import { BindModal } from "import/BindModal";
import type { BindResult } from "import/BindModal";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import type { ConsentGate } from "consent/ConsentGate";
import type { RegisterCommandCallback } from "import/types";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: "views/chars.md",
		engine: "dataviewjs",
		version: 1,
		name: "Characters in Scene",
		description: "Lists characters",
		command: false,
		querySource: "dv.list(dv.pages())\n",
		checksum: ("sha256:" + "a".repeat(64)) as `sha256:${string}`,
		...overrides,
	};
}

function makeGate(
	tokens: { version: number; checksum: string } | null,
): ConsentGate {
	return {
		requestConsentForDef: vi.fn(async () => tokens),
	} as unknown as ConsentGate;
}

function makeImporter(id = "new-id"): ViewImporter {
	return {
		importToStore: vi.fn(async () => id),
	} as unknown as ViewImporter;
}

function makeBindResult(overrides: Partial<BindResult> = {}): BindResult {
	return {
		label: "My Tab",
		registerCommand: true,
		commandName: "Story Forge: X",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runImportFlow — deferred-atomic one-flow", () => {
	let app: App;
	let registerCommand: RegisterCommandCallback;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		Notice._reset();
		app = new App();
		registerCommand = vi.fn();
	});

	it("HAPPY PATH: commits with tokens+label and fires registerCommand once", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter("id-42");
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue(
			makeBindResult({
				label: "My Tab",
				registerCommand: true,
				commandName: "Story Forge: X",
			}),
		);
		const def = makeDef();

		await runImportFlow({ app, importer, gate, registerCommand }, def);

		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: tokens,
			enabled: true,
			commandName: "My Tab",
		});
		expect(registerCommand).toHaveBeenCalledTimes(1);
		expect(registerCommand).toHaveBeenCalledWith("id-42", "Story Forge: X");
	});

	it("bind with registerCommand:false → imports but does NOT registerCommand", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter();
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue(
			makeBindResult({ registerCommand: false }),
		);

		await runImportFlow({ app, importer, gate, registerCommand }, makeDef());

		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("CONSENT CANCEL: commits NOTHING and never shows the bind modal", async () => {
		const gate = makeGate(null);
		const importer = makeImporter();
		const presentSpy = vi.spyOn(BindModal.prototype, "present");

		await runImportFlow({ app, importer, gate, registerCommand }, makeDef());

		expect(importer.importToStore).not.toHaveBeenCalled();
		expect(registerCommand).not.toHaveBeenCalled();
		expect(presentSpy).not.toHaveBeenCalled();
	});

	it("BIND BACK: commits NOTHING", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter();
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue(null);

		await runImportFlow({ app, importer, gate, registerCommand }, makeDef());

		expect(importer.importToStore).not.toHaveBeenCalled();
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("DUPLICATE race: shows a Notice and returns without throwing", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new ImportError("DUPLICATE", "View already imported");
			}),
		} as unknown as ViewImporter;
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue(makeBindResult());

		await expect(
			runImportFlow({ app, importer, gate, registerCommand }, makeDef()),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toBe("View already imported");
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("UNEXPECTED error: plain Error surfaces a generic Notice and returns without throwing", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new Error("disk full");
			}),
		} as unknown as ViewImporter;
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue(makeBindResult());
		// The catch branch logs the real error; suppress it for this test only.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			runImportFlow({ app, importer, gate, registerCommand }, makeDef()),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toBe("Import failed: unexpected error");
		expect(registerCommand).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});
