/**
 * T1.1 – ViewRecord model & fail-closed defaults
 * T3.1 – kind discriminant, surfaces, generated (ADR-29)
 *
 * Contracts under test:
 *   - applyDefaults: missing fields -> disabled, not-consented, curated
 *   - parseOkayed: only {version:number, checksum:string} is valid; anything else -> null
 *   - isEngine: unknown engine -> false
 *   - applyDefaults: unknown engine -> "bases"
 *   - applyDefaults: provenance other than "imported" -> "curated"
 *   - applyDefaults: unknown/missing kind -> "view" (ADR-29, fail-closed)
 *   - applyDefaults: surfaces always materialises, defaulting to both false
 *   - applyDefaults: well-formed generated round-trips; malformed -> absent, no throw
 */

import { describe, expect, it } from "vitest";
import {
  applyDefaults,
  isEngine,
  isKind,
  parseGenerated,
  parseOkayed,
  parseSurfaces,
} from "../../src/store/types";
import type { ViewRecord } from "../../src/store/types";

// ---------------------------------------------------------------------------
// parseOkayed
// ---------------------------------------------------------------------------

describe("parseOkayed", () => {
  it("accepts a valid okayed object", () => {
    expect(parseOkayed({ version: 1, checksum: "abc" })).toEqual({
      version: 1,
      checksum: "abc",
    });
  });

  it("returns null for undefined", () => {
    expect(parseOkayed(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseOkayed(null)).toBeNull();
  });

  it("returns null for a bare number", () => {
    expect(parseOkayed(42)).toBeNull();
  });

  it("returns null for a bare string", () => {
    expect(parseOkayed("consented")).toBeNull();
  });

  it("returns null for an empty object", () => {
    expect(parseOkayed({})).toBeNull();
  });

  it("returns null when version is present but checksum is missing", () => {
    expect(parseOkayed({ version: 1 })).toBeNull();
  });

  it("returns null when checksum is present but version is missing", () => {
    expect(parseOkayed({ checksum: "abc" })).toBeNull();
  });

  it("returns null when version is a string (not a number)", () => {
    expect(parseOkayed({ version: "1", checksum: "abc" })).toBeNull();
  });

  it("returns null when checksum is a number (not a string)", () => {
    expect(parseOkayed({ version: 1, checksum: 123 })).toBeNull();
  });

  it("returns null for an array", () => {
    expect(parseOkayed([1, "abc"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isEngine
// ---------------------------------------------------------------------------

describe("isEngine", () => {
  it("accepts 'bases'", () => {
    expect(isEngine("bases")).toBe(true);
  });

  it("accepts 'dataview-dql'", () => {
    expect(isEngine("dataview-dql")).toBe(true);
  });

  it("accepts 'dataviewjs'", () => {
    expect(isEngine("dataviewjs")).toBe(true);
  });

  it("rejects unknown string", () => {
    expect(isEngine("unknown")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isEngine(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isEngine(null)).toBe(false);
  });

  it("rejects number", () => {
    expect(isEngine(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyDefaults
// ---------------------------------------------------------------------------

describe("applyDefaults", () => {
  it("fills all missing fields with fail-closed defaults", () => {
    const result = applyDefaults(undefined);
    expect(result).toEqual({
      provenance: "curated",
      enabled: false,
      okayed: null,
      source: "",
      engine: "bases",
      command: false,
      kind: "view",
      surfaces: { anvil: false, workbench: false },
    });
  });

  it("fills missing fields when given an empty object", () => {
    const result = applyDefaults({});
    expect(result).toEqual({
      provenance: "curated",
      enabled: false,
      okayed: null,
      source: "",
      engine: "bases",
      command: false,
      kind: "view",
      surfaces: { anvil: false, workbench: false },
    });
  });

  it("preserves valid 'imported' provenance", () => {
    expect(applyDefaults({ provenance: "imported" }).provenance).toBe("imported");
  });

  it("coerces unknown provenance to 'curated'", () => {
    // @ts-expect-error intentional bad provenance
    expect(applyDefaults({ provenance: "third-party" }).provenance).toBe("curated");
  });

  it("coerces 'curated' provenance to 'curated' (explicit)", () => {
    expect(applyDefaults({ provenance: "curated" }).provenance).toBe("curated");
  });

  it("preserves enabled:true", () => {
    expect(applyDefaults({ enabled: true }).enabled).toBe(true);
  });

  it("coerces truthy non-boolean enabled to false", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ enabled: 1 }).enabled).toBe(false);
  });

  it("coerces malformed okayed (number) to null", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ okayed: 42 }).okayed).toBeNull();
  });

  it("coerces malformed okayed (string) to null", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ okayed: "yes" }).okayed).toBeNull();
  });

  it("coerces malformed okayed (empty object) to null", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ okayed: {} }).okayed).toBeNull();
  });

  it("coerces malformed okayed (missing checksum) to null", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ okayed: { version: 1 } }).okayed).toBeNull();
  });

  it("accepts a valid okayed object", () => {
    expect(
      applyDefaults({ okayed: { version: 2, checksum: "sha256:abc" } }).okayed,
    ).toEqual({ version: 2, checksum: "sha256:abc" });
  });

  it("coerces unknown engine to 'bases'", () => {
    // @ts-expect-error intentional bad engine
    expect(applyDefaults({ engine: "jinja" }).engine).toBe("bases");
  });

  it("preserves valid engine 'dataview-dql'", () => {
    expect(applyDefaults({ engine: "dataview-dql" }).engine).toBe("dataview-dql");
  });

  it("preserves valid engine 'dataviewjs'", () => {
    expect(applyDefaults({ engine: "dataviewjs" }).engine).toBe("dataviewjs");
  });

  it("preserves source string", () => {
    expect(applyDefaults({ source: "views/my-view.md" }).source).toBe(
      "views/my-view.md",
    );
  });

  it("coerces non-string source to empty string", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ source: 99 }).source).toBe("");
  });

  it("coerces truthy non-boolean command to false", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ command: 1 }).command).toBe(false);
  });

  it("preserves optional description", () => {
    expect(applyDefaults({ description: "A handy view" }).description).toBe(
      "A handy view",
    );
  });

  it("preserves optional commandName", () => {
    expect(applyDefaults({ commandName: "Open Scene List" }).commandName).toBe(
      "Open Scene List",
    );
  });

  it("preserves optional commandLabel", () => {
    expect(applyDefaults({ commandLabel: "Open Cast List" }).commandLabel).toBe(
      "Open Cast List",
    );
  });

  it("does not add description when absent", () => {
    const result = applyDefaults({});
    expect("description" in result).toBe(false);
  });

  it("does not add commandLabel when absent", () => {
    const result = applyDefaults({});
    expect("commandLabel" in result).toBe(false);
  });

  it("preserves optional catalogId", () => {
    expect(applyDefaults({ catalogId: "overview-characters" }).catalogId).toBe(
      "overview-characters",
    );
  });

  it("does not add catalogId when absent", () => {
    const result = applyDefaults({});
    expect("catalogId" in result).toBe(false);
  });

  it("keeps installedSourceChecksum across a save and load (T7.2)", () => {
    const saved = JSON.parse(JSON.stringify(applyDefaults({ installedSourceChecksum: "sha256:abc" }))) as Partial<ViewRecord>;
    expect(applyDefaults(saved).installedSourceChecksum).toBe("sha256:abc");
  });

  it("drops an installedSourceChecksum that is not a string, and adds none when absent", () => {
    expect("installedSourceChecksum" in applyDefaults({ installedSourceChecksum: 42 as unknown as string })).toBe(false);
    expect("installedSourceChecksum" in applyDefaults({})).toBe(false);
  });

  // -------------------------------------------------------------------------
  // kind (ADR-29)
  // -------------------------------------------------------------------------

  it("defaults a legacy record without kind to kind:'view'", () => {
    // Legacy persisted shape predates the kind discriminant entirely.
    expect(applyDefaults({ source: "views/legacy.md" }).kind).toBe("view");
  });

  it("coerces an unknown kind string to 'view' (fail-closed)", () => {
    // @ts-expect-error intentional bad kind
    expect(applyDefaults({ kind: "database" }).kind).toBe("view");
  });

  it("preserves valid kind 'collection'", () => {
    expect(applyDefaults({ kind: "collection" }).kind).toBe("collection");
  });

  it("preserves valid kind 'card'", () => {
    expect(applyDefaults({ kind: "card" }).kind).toBe("card");
  });

  // -------------------------------------------------------------------------
  // surfaces (F7 per-entry binding)
  // -------------------------------------------------------------------------

  it("defaults surfaces to both false when absent", () => {
    expect(applyDefaults({}).surfaces).toEqual({ anvil: false, workbench: false });
  });

  it("preserves a well-formed surfaces object", () => {
    expect(
      applyDefaults({ surfaces: { anvil: true, workbench: false } }).surfaces,
    ).toEqual({ anvil: true, workbench: false });
  });

  it("coerces a malformed surfaces object to both false", () => {
    expect(
      // @ts-expect-error intentional bad shape
      applyDefaults({ surfaces: { anvil: "yes" } }).surfaces,
    ).toEqual({ anvil: false, workbench: false });
  });

  it("coerces a non-object surfaces value to both false", () => {
    // @ts-expect-error intentional bad value
    expect(applyDefaults({ surfaces: "both" }).surfaces).toEqual({
      anvil: false,
      workbench: false,
    });
  });

  // -------------------------------------------------------------------------
  // generated (curated collections — ADR-0003)
  // -------------------------------------------------------------------------

  const validGenerated = {
    sourceChecksum: "sha256:template",
    params: { tag: "character", excludedFolders: ["00 Meta"] },
    instanceChecksum: "sha256:instance",
    filePath: "views/characters.base",
    verify: true,
  };

  it("round-trips a well-formed generated block", () => {
    expect(applyDefaults({ generated: validGenerated }).generated).toEqual(
      validGenerated,
    );
  });

  it("does not add generated when absent", () => {
    const result = applyDefaults({});
    expect("generated" in result).toBe(false);
  });

  it("drops a generated block with a wrong-typed field (no throw)", () => {
    const raw = { generated: { ...validGenerated, verify: "yes" } };
    // @ts-expect-error intentional bad shape
    expect(() => applyDefaults(raw)).not.toThrow();
    // @ts-expect-error intentional bad shape
    expect("generated" in applyDefaults(raw)).toBe(false);
  });

  it("drops a generated block missing a required field (no throw)", () => {
    const { filePath: _filePath, ...missingFilePath } = validGenerated;
    const raw = { generated: missingFilePath };
    // @ts-expect-error intentional bad shape
    expect(() => applyDefaults(raw)).not.toThrow();
    // @ts-expect-error intentional bad shape
    expect("generated" in applyDefaults(raw)).toBe(false);
  });

  it("drops a generated block with a malformed nested params object (no throw)", () => {
    const raw = {
      generated: { ...validGenerated, params: { tag: "character" } },
    };
    // @ts-expect-error intentional bad shape
    expect(() => applyDefaults(raw)).not.toThrow();
    // @ts-expect-error intentional bad shape
    expect("generated" in applyDefaults(raw)).toBe(false);
  });

  it("drops a non-object generated value (no throw)", () => {
    // @ts-expect-error intentional bad value
    expect(() => applyDefaults({ generated: "yes" })).not.toThrow();
    // @ts-expect-error intentional bad value
    expect("generated" in applyDefaults({ generated: "yes" })).toBe(false);
  });

  it("drops an array generated value (no throw)", () => {
    // @ts-expect-error intentional bad value
    expect(() => applyDefaults({ generated: [] })).not.toThrow();
    // @ts-expect-error intentional bad value
    expect("generated" in applyDefaults({ generated: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isKind
// ---------------------------------------------------------------------------

describe("isKind", () => {
  it("accepts 'view'", () => {
    expect(isKind("view")).toBe(true);
  });

  it("accepts 'collection'", () => {
    expect(isKind("collection")).toBe(true);
  });

  it("accepts 'card'", () => {
    expect(isKind("card")).toBe(true);
  });

  it("rejects unknown string", () => {
    expect(isKind("database")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isKind(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isKind(null)).toBe(false);
  });

  it("rejects number", () => {
    expect(isKind(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseSurfaces
// ---------------------------------------------------------------------------

describe("parseSurfaces", () => {
  it("returns {anvil:false, workbench:false} for undefined", () => {
    expect(parseSurfaces(undefined)).toEqual({ anvil: false, workbench: false });
  });

  it("returns {anvil:false, workbench:false} for null", () => {
    expect(parseSurfaces(null)).toEqual({ anvil: false, workbench: false });
  });

  it("preserves a well-formed surfaces object", () => {
    expect(parseSurfaces({ anvil: true, workbench: true })).toEqual({
      anvil: true,
      workbench: true,
    });
  });

  it("coerces a non-boolean anvil to false, keeps a valid workbench", () => {
    expect(parseSurfaces({ anvil: "true", workbench: true })).toEqual({
      anvil: false,
      workbench: true,
    });
  });

  it("returns {anvil:false, workbench:false} for an array", () => {
    expect(parseSurfaces([true, true])).toEqual({ anvil: false, workbench: false });
  });

  it("returns {anvil:false, workbench:false} for a bare string", () => {
    expect(parseSurfaces("both")).toEqual({ anvil: false, workbench: false });
  });
});

// ---------------------------------------------------------------------------
// parseGenerated
// ---------------------------------------------------------------------------

describe("parseGenerated", () => {
  const validGenerated = {
    sourceChecksum: "sha256:template",
    params: { tag: "character", excludedFolders: ["00 Meta"] },
    instanceChecksum: "sha256:instance",
    filePath: "views/characters.base",
    verify: true,
  };

  it("accepts a well-formed generated block", () => {
    expect(parseGenerated(validGenerated)).toEqual(validGenerated);
  });

  it("returns undefined for undefined", () => {
    expect(parseGenerated(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(parseGenerated(null)).toBeUndefined();
  });

  it("returns undefined for a bare string", () => {
    expect(parseGenerated("yes")).toBeUndefined();
  });

  it("returns undefined for an array", () => {
    expect(parseGenerated([])).toBeUndefined();
  });

  it("returns undefined when a top-level field has the wrong type", () => {
    expect(parseGenerated({ ...validGenerated, verify: "yes" })).toBeUndefined();
  });

  it("returns undefined when a required field is missing", () => {
    const { instanceChecksum: _instanceChecksum, ...rest } = validGenerated;
    expect(parseGenerated(rest)).toBeUndefined();
  });

  it("returns undefined when sourceChecksum is a number (not a string)", () => {
    expect(
      parseGenerated({ ...validGenerated, sourceChecksum: 12345 }),
    ).toBeUndefined();
  });

  it("returns undefined when sourceChecksum is missing", () => {
    const { sourceChecksum: _sourceChecksum, ...rest } = validGenerated;
    expect(parseGenerated(rest)).toBeUndefined();
  });

  it("returns undefined when filePath is a number (not a string)", () => {
    expect(parseGenerated({ ...validGenerated, filePath: 12345 })).toBeUndefined();
  });

  it("returns undefined when filePath is missing", () => {
    const { filePath: _filePath, ...rest } = validGenerated;
    expect(parseGenerated(rest)).toBeUndefined();
  });

  it("returns undefined when params.tag is a number (not a string)", () => {
    expect(
      parseGenerated({
        ...validGenerated,
        params: { ...validGenerated.params, tag: 42 },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when params.excludedFolders is not a string array", () => {
    expect(
      parseGenerated({
        ...validGenerated,
        params: { tag: "character", excludedFolders: [1, 2] },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when params is missing", () => {
    const { params: _params, ...rest } = validGenerated;
    expect(parseGenerated(rest)).toBeUndefined();
  });
});
