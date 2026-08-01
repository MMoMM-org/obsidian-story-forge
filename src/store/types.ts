/**
 * View store — data model and low-level helpers.
 *
 * ADR-1: flat Record<id, ViewRecord> in data.json (shared with settings),
 * NO schemaVersion/migration, fail-closed applyDefaults.
 */

import type { PluginSettings } from "types/index";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ViewRecord {
  provenance: "curated" | "imported";
  /** Whether the view is active in the sidebar/note panel. Defaults to false. */
  enabled: boolean;
  /**
   * Consent slot (M2). null until the user explicitly okays the view after
   * reviewing its source. Any malformed shape is treated as not-consented.
   */
  okayed: { version: number; checksum: string } | null;
  /** Vault path or catalog ref. */
  source: string;
  /** Query engine discriminant (DESIGN §4). */
  engine: "bases" | "dataview-dql" | "dataviewjs";
  /** Whether this view can be bound to a command palette entry. */
  command: boolean;
  /** Catalog blurb (optional). */
  description?: string;
  /** User-chosen sidebar tab label (optional). */
  commandName?: string;
  /**
   * Stable catalog entry id (slug, e.g. "overview-characters") set on install.
   * Optional for backward-compatibility with records persisted before T4.5.
   * Used by BrowseOfficialModal to match installed records to catalog entries
   * without relying on the mutable entry.name (which can change on catalog rename).
   */
  catalogId?: string;
  /**
   * Palette command display name (optional). Distinct from `commandName`,
   * which is the sidebar tab label.
   */
  commandLabel?: string;
  /**
   * Discriminant (ADR-29): collections and cards need different fields; a
   * single flat ViewRecord would collect optional members that are
   * meaningless for two of the three kinds. Legacy records (no `kind`) and
   * any unrecognised value default to "view" (fail-closed).
   */
  kind: "view" | "collection" | "card";
  /** Per-entry surface binding (F7). Always materialises; defaults to both false. */
  surfaces: { anvil: boolean; workbench: boolean };
  /**
   * Curated-collection provenance (ADR-0003) — present only for kind:"collection"
   * entries rendered from a catalog template. Absent for anything hand-authored
   * or imported. Any malformed shape degrades to "not generated" (field absent).
   */
  generated?: {
    /** The template's checksum — "did upstream change". */
    sourceChecksum: string;
    /** What it was rendered with. */
    params: { tag: string; excludedFolders: string[] };
    /** The written file's checksum — "was it edited". */
    instanceChecksum: string;
    /** The artifact's path in the vault. */
    filePath: string;
    /** false = "this file is yours now" (ADR-0003 §7). */
    verify: boolean;
  };
}

/**
 * Top-level data.json — shared blob with settings (mason PluginData shape).
 * StoryForgeSettings is the existing settings type; they coexist in one JSON blob.
 */
export interface StoryForgeData {
  settings?: StoryForgeSettings;
  /** Keyed by view id — NOT an array, NO schemaVersion. */
  views?: Record<string, ViewRecord>;
}

/** Re-exported alias so store code doesn't need to import from types/index. */
export type StoryForgeSettings = PluginSettings;

/**
 * Injected Obsidian IO — makes ViewStore unit-testable with a fake port.
 * In production this wraps Plugin.loadData / Plugin.saveData.
 */
export interface PluginDataPort {
  load(): Promise<unknown>;
  save(data: unknown): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

const ENGINES = new Set(["bases", "dataview-dql", "dataviewjs"] as const);

/**
 * Type guard — returns true only for the three known engine strings.
 */
export function isEngine(value: unknown): value is ViewRecord["engine"] {
  return typeof value === "string" && ENGINES.has(value as ViewRecord["engine"]);
}

/**
 * parseOkayed — accepts only {version: number, checksum: string}.
 * Any other shape (number, string, {}, missing fields, wrong types) → null.
 */
export function parseOkayed(
  raw: unknown,
): { version: number; checksum: string } | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw;
  if (typeof obj["version"] !== "number") return null;
  if (typeof obj["checksum"] !== "string") return null;
  return { version: obj["version"], checksum: obj["checksum"] };
}

const KINDS = new Set(["view", "collection", "card"] as const);

/**
 * Type guard — returns true only for the three known kind strings.
 */
export function isKind(value: unknown): value is ViewRecord["kind"] {
  return typeof value === "string" && KINDS.has(value as ViewRecord["kind"]);
}

/**
 * isPlainObject — true for non-null, non-array objects. Shared shape guard
 * for the parse* helpers below (each still validates its own fields).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * parseSurfaces — accepts only {anvil: boolean, workbench: boolean}, field
 * by field. Any missing or malformed member falls back to false; the object
 * itself always materialises (never null/undefined).
 */
export function parseSurfaces(raw: unknown): ViewRecord["surfaces"] {
  if (!isPlainObject(raw)) {
    return { anvil: false, workbench: false };
  }
  const obj = raw;
  return {
    anvil: obj["anvil"] === true,
    workbench: obj["workbench"] === true,
  };
}

/**
 * parseGenerated — accepts only a fully well-formed generated block (ADR-0003).
 * Any malformed shape (wrong field types, missing fields, non-object, array)
 * degrades to "not generated" (undefined) rather than throwing.
 */
export function parseGenerated(raw: unknown): ViewRecord["generated"] | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const obj = raw;

  if (typeof obj["sourceChecksum"] !== "string") return undefined;
  if (typeof obj["instanceChecksum"] !== "string") return undefined;
  if (typeof obj["filePath"] !== "string") return undefined;
  if (typeof obj["verify"] !== "boolean") return undefined;

  const params = obj["params"];
  if (!isPlainObject(params)) {
    return undefined;
  }
  const paramsObj = params;
  if (typeof paramsObj["tag"] !== "string") return undefined;
  const excludedFolders = paramsObj["excludedFolders"];
  if (
    !Array.isArray(excludedFolders) ||
    !excludedFolders.every((entry) => typeof entry === "string")
  ) {
    return undefined;
  }

  return {
    sourceChecksum: obj["sourceChecksum"],
    instanceChecksum: obj["instanceChecksum"],
    filePath: obj["filePath"],
    verify: obj["verify"],
    params: { tag: paramsObj["tag"], excludedFolders },
  };
}

/**
 * applyDefaults — fail-closed: any missing or malformed field gets a safe
 * default (disabled, not-consented, curated, bases engine).
 */
export function applyDefaults(
  raw: Partial<ViewRecord> | undefined,
): ViewRecord {
  const base: ViewRecord = {
    provenance: raw?.provenance === "imported" ? "imported" : "curated",
    enabled: raw?.enabled === true,
    okayed: parseOkayed(raw?.okayed),
    source: typeof raw?.source === "string" ? raw.source : "",
    engine: isEngine(raw?.engine) ? raw.engine : "bases",
    command: raw?.command === true,
    kind: isKind(raw?.kind) ? raw.kind : "view",
    surfaces: parseSurfaces(raw?.surfaces),
  };

  // Optional fields — only include when present so callers can do `'description' in result`
  if (raw?.description !== undefined) {
    base.description = raw.description;
  }
  if (raw?.commandName !== undefined) {
    base.commandName = raw.commandName;
  }
  if (raw?.commandLabel !== undefined) {
    base.commandLabel = raw.commandLabel;
  }
  if (raw?.catalogId !== undefined) {
    base.catalogId = raw.catalogId;
  }
  const generated = parseGenerated(raw?.generated);
  if (generated !== undefined) {
    base.generated = generated;
  }

  return base;
}
