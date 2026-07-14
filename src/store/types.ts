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
  /** User-chosen palette label (optional). */
  commandName?: string;
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
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj["version"] !== "number") return null;
  if (typeof obj["checksum"] !== "string") return null;
  return { version: obj["version"], checksum: obj["checksum"] };
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
  };

  // Optional fields — only include when present so callers can do `'description' in result`
  if (raw?.description !== undefined) {
    base.description = raw.description;
  }
  if (raw?.commandName !== undefined) {
    base.commandName = raw.commandName;
  }

  return base;
}
