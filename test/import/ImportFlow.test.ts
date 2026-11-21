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

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
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

	it("HAPPY PATH: DataviewJS consent grants tokens → commits once with tokens + def.name label", async () => {
		const tokens = { version: 1, checksum: "sha256:abc" };
		const gate = makeGate(tokens);
		const importer = makeImporter("id-42");
		const def = makeDef({ name: "Characters in Scene" });

		const outcome = await runImportFlow({ app, importer, gate }, def);

		expect(outcome).toEqual({ status: "imported", id: "id-42" });
		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: tokens,
			enabled: true,
			commandName: "Characters in Scene",
		});
	});

	// L11 R1: Dataview (DQL) imports like a .base — no disclosure dialog, tokens from the parsed def.
	it("DQL: saves at once with no consent modal, tokens = { sf-version, block checksum }", async () => {
		const gate = makeGate(null);
		const importer = makeImporter("id-dql");
		const def = makeDqlDef({ version: 4 });

		const outcome = await runImportFlow({ app, importer, gate }, def);

		expect(outcome).toEqual({ status: "imported", id: "id-dql" });
		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: { version: 4, checksum: def.checksum },
			enabled: true,
			commandName: def.name,
		});
	});

	it("CONSENT CANCEL: DataviewJS consent → null commits NOTHING and reports 'declined'", async () => {
		const gate = makeGate(null);
		const importer = makeImporter();

		const outcome = await runImportFlow({ app, importer, gate }, makeDef());

		expect(outcome).toEqual({ status: "declined" });
		expect(importer.importToStore).not.toHaveBeenCalled();
	});

	it("DUPLICATE race: importToStore throws ImportError → 'failed' with that error, no Notice", async () => {
		const gate = makeGate({ version: 1, checksum: "sha256:abc" });
		const duplicate = new ImportError("DUPLICATE", "Collection already imported");
		const importer = {
			importToStore: vi.fn(async () => {
				throw duplicate;
			}),
		} as unknown as ViewImporter;

		const outcome = await runImportFlow({ app, importer, gate }, makeDef());

		expect(outcome).toEqual({ status: "failed", error: duplicate });
		expect(Notice._instances).toHaveLength(0);
	});

	it("a rejecting consent gate is 'failed' and logged — runImportFlow never throws", async () => {
		const boom = new Error("modal blew up");
		const gate = { requestConsentForDef: vi.fn(async () => { throw boom; }) } as unknown as ConsentGate;
		const importer = makeImporter();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const outcome = await runImportFlow({ app, importer, gate }, makeDef());

		expect(outcome).toEqual({ status: "failed", error: boom });
		expect(importer.importToStore).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(boom);
	});

	it("UNEXPECTED error: plain Error → console.error + 'failed', resolves without throwing, no Notice", async () => {
		const gate = makeGate({ version: 1, checksum: "sha256:abc" });
		const boom = new Error("disk full");
		const importer = {
			importToStore: vi.fn(async () => {
				throw boom;
			}),
		} as unknown as ViewImporter;
		// The catch branch logs the real error; suppress it for this test only.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const outcome = await runImportFlow({ app, importer, gate }, makeDef());

		expect(outcome).toEqual({ status: "failed", error: boom });
		expect(Notice._instances).toHaveLength(0);
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
				throw new ImportError("DUPLICATE", "Collection already imported");
			}),
		} as unknown as ViewImporter;
		const def = makeDqlDef();

		await expect(
			installCurated({ app, importer, gate }, def),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toContain("up-to-date");
	});

	it("UNEXPECTED error: plain Error → console.error + generic Notice, resolves without throwing", async () => {
		const gate = makeGate(null);
		const importer = {
			importToStore: vi.fn(async () => {
				throw new Error("disk full");
			}),
		} as unknown as ViewImporter;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const def = makeDqlDef();

		await expect(
			installCurated({ app, importer, gate }, def),
		).resolves.toBeUndefined();

		expect(Notice._instances).toHaveLength(1);
		expect(Notice._instances[0]!.message).toBe("Install failed: unexpected error");
		expect(errorSpy).toHaveBeenCalledTimes(1);
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
			importer.importToStore as Mock
		).mock.calls[0]!;
		expect(calledRec.okayed).toBeNull();
	});
});
