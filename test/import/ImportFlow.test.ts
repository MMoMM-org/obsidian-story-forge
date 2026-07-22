/**
 * Tests for runImportFlow (T-S2.4, F2) — consent-then-commit import.
 * Tests for installCurated (T4.3) — gate-less curated catalog install.
 *
 * The bind step was removed (F2): import is pick → one consent gate → commit.
 * Command binding is a separate Settings action, not part of the import flow.
 *
 * SDD/Flow C (revised): consent (no write) → importToStore (single commit).
 * Nothing is committed until consent grants tokens: cancelling consent commits
 * NOTHING.
 *
 * Test strategy:
 * - Mock gate.requestConsentForDef and importer.importToStore.
 * - Assert the exact importToStore opts ({okayed, enabled, commandName}), that
 *   consent-cancel commits nothing, and that a DUPLICATE race / unexpected error
 *   surfaces a Notice without throwing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice } from "../__mocks__/obsidian";
import { runImportFlow, installCurated } from "import/ImportFlow";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import type { ConsentGate } from "consent/ConsentGate";

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

function makeDqlDef(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: "catalog/overview-characters.base",
		engine: "dataview-dql",
		version: 1,
		name: "Characters Overview",
		description: "All characters",
		command: false,
		querySource: "LIST FROM #character\n",
		checksum: ("sha256:" + "b".repeat(64)) as `sha256:${string}`,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runImportFlow — consent-then-commit (no bind step)", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		Notice._reset();
		app = new App();
	});

	it("HAPPY PATH: consent grants tokens → commits once with tokens + def.name label", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter("id-42");
		const def = makeDef({ name: "Characters in Scene" });

		await runImportFlow({ app, importer, gate }, def);

		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: tokens,
			enabled: true,
			commandName: "Characters in Scene",
		});
	});

	it("CONSENT CANCEL: consent → null commits NOTHING", async () => {
		const gate = makeGate(null);
		const importer = makeImporter();

		await runImportFlow({ app, importer, gate }, makeDef());

		expect(importer.importToStore).not.toHaveBeenCalled();
	});

	it("DUPLICATE race: importToStore throws ImportError → Notice, returns without throwing", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new ImportError("DUPLICATE", "View already imported");
			}),
		} as unknown as ViewImporter;

		await expect(
			runImportFlow({ app, importer, gate }, makeDef()),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toBe("View already imported");
	});

	it("UNEXPECTED error: plain Error → console.error + generic Notice, returns without throwing", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new Error("disk full");
			}),
		} as unknown as ViewImporter;
		// The catch branch logs the real error; suppress it for this test only.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			runImportFlow({ app, importer, gate }, makeDef()),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toBe("Import failed: unexpected error");
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// T4.3 — installCurated — gate-less path for declarative engines
// ---------------------------------------------------------------------------

describe("installCurated — T4.3 gate-less declarative flow", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		Notice._reset();
		app = new App();
	});

	it("installs a dataview-dql entry WITHOUT calling requestConsentForDef", async () => {
		const gate = makeGate({ version: 1, checksum: "sha256:abc" });
		const importer = makeImporter("curated-id");
		const def = makeDqlDef();

		await installCurated({ app, importer, gate }, def);

		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		expect(importer.importToStore).toHaveBeenCalledTimes(1);
	});

	it("installs a dataview-dql entry with provenance:'curated', enabled:true, okayed:null", async () => {
		const gate = makeGate(null);
		const importer = makeImporter("curated-id");
		const def = makeDqlDef();

		await installCurated({ app, importer, gate }, def);

		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			provenance: "curated",
			enabled: true,
			okayed: null,
			commandName: def.name,
		});
	});

	it("routes a dataviewjs entry through requestConsentForDef", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter("curated-dvjs-id");
		const def = makeDef({ engine: "dataviewjs" });

		await installCurated({ app, importer, gate }, def);

		expect(gate.requestConsentForDef).toHaveBeenCalledWith(def);
	});

	it("dataviewjs: declined consent (null) writes NOTHING", async () => {
		const gate = makeGate(null);
		const importer = makeImporter();
		const def = makeDef({ engine: "dataviewjs" });

		await installCurated({ app, importer, gate }, def);

		expect(importer.importToStore).not.toHaveBeenCalled();
	});

	it("dataviewjs: granted consent writes once with curated provenance + consent tokens", async () => {
		const tokens = { version: 2, checksum: "sha256:xyz" };
		const gate = makeGate(tokens);
		const importer = makeImporter("curated-dvjs-id");
		const def = makeDef({ engine: "dataviewjs", name: "Fancy View" });

		await installCurated({ app, importer, gate }, def);

		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			provenance: "curated",
			enabled: true,
			okayed: tokens,
			commandName: "Fancy View",
		});
	});

	it("dataviewjs can NEVER reach the gate-less path — gate is always called", async () => {
		// Even when the gate grants consent, a dataviewjs def must pass through it.
		// Passing null tokens (decline) verifies the gate was still invoked.
		const gate = makeGate(null);
		const importer = makeImporter();
		const def = makeDef({ engine: "dataviewjs" });

		await installCurated({ app, importer, gate }, def);

		expect(gate.requestConsentForDef).toHaveBeenCalledTimes(1);
		expect(importer.importToStore).not.toHaveBeenCalled();
	});

	it("a duplicate source surfaces as an 'up-to-date' Notice — not a raw DUPLICATE error", async () => {
		const gate = makeGate(null);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new ImportError("DUPLICATE", "View already imported");
			}),
		} as unknown as ViewImporter;
		const def = makeDqlDef();

		await expect(
			installCurated({ app, importer, gate }, def),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toContain("up-to-date");
	});

	it("checksum and consent are independent — declarative install does not require tokens", async () => {
		// A DQL install must NOT consult requestConsentForDef; consent tokens stay null.
		// Checksum is recorded by CatalogService (T4.4) and is a separate concern.
		const gate = makeGate({ version: 99, checksum: "sha256:mismatch" });
		const importer = makeImporter("decl-id");
		const def = makeDqlDef();

		await installCurated({ app, importer, gate }, def);

		// gate was never called, so the granted tokens had no effect
		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		const [, calledRec] = (
			importer.importToStore as ReturnType<typeof vi.fn>
		).mock.calls[0]!;
		expect(calledRec.okayed).toBeNull();
	});
});
