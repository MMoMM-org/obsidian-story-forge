/**
 * T1.1 – ViewRecord model & fail-closed defaults
 *
 * Contracts under test:
 *   - applyDefaults: missing fields -> disabled, not-consented, curated
 *   - parseOkayed: only {version:number, checksum:string} is valid; anything else -> null
 *   - isEngine: unknown engine -> false
 *   - applyDefaults: unknown engine -> "bases"
 *   - applyDefaults: provenance other than "imported" -> "curated"
 */

import { describe, expect, it } from "vitest";
import { applyDefaults, isEngine, parseOkayed } from "../../src/store/types";

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
});
