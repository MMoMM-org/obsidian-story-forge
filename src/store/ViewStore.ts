/**
 * ViewStore — persistent record of user-managed views.
 *
 * ADR-1: flat Record<id, ViewRecord> in data.json, shared blob with settings.
 * ADR-6: persist ONLY on user-initiated mutations (setRecord/deleteRecord).
 *         Read-modify-write preserving sibling `settings`. Never persist on read.
 *         EXCEPTION: getViews() also persists once for the ADR-29 legacy-bases
 *         migration — see the comment on getViews() and migrateLegacyBases.ts.
 */

import { applyDefaults, type PluginDataPort, type StoryForgeData, type ViewRecord } from "store/types";
import { migrateLegacyBases, type MigrateLegacyBasesDeps } from "store/migrateLegacyBases";

export class ViewStore {
  private readonly port: PluginDataPort;
  private readonly migrationDeps: MigrateLegacyBasesDeps;
  private readonly _subscribers = new Set<() => void>();
  /**
   * In-flight getViews() promise (T3.2 fix). Whether a call needs to migrate
   * can only be known after an async read, so two overlapping calls cannot
   * each synchronously check-and-set a "migration needed" flag without a
   * race — this field is instead set synchronously (before any await) at the
   * top of getViews() itself, so a second caller arriving in the same tick
   * is guaranteed to observe it and await the first caller's read+migrate
   * instead of starting its own. That is what makes "persists at most once"
   * true under `Promise.all([store.getViews(), store.getViews()])`.
   */
  private _migrationInFlight: Promise<Record<string, ViewRecord>> | null = null;

  constructor(port: PluginDataPort, migrationDeps: MigrateLegacyBasesDeps) {
    this.port = port;
    this.migrationDeps = migrationDeps;
  }

  /**
   * Subscribe to view-store mutations. Returns an unsubscribe function.
   * The callback fires AFTER persist so getViews() returns committed state.
   */
  subscribe(cb: () => void): () => void {
    this._subscribers.add(cb);
    return () => { this._subscribers.delete(cb); };
  }

  /** Iterate a copy of the subscriber set; swallow per-subscriber errors. */
  private _notify(): void {
    for (const cb of [...this._subscribers]) {
      try {
        cb();
      } catch (e) {
        console.error("[StoryForge] view subscriber failed", e);
      }
    }
  }

  /**
   * Returns all stored views, each passed through applyDefaults (fail-closed).
   * Does NOT persist — ADR-6 read path.
   *
   * EXCEPTION (T3.2/ADR-29): legacy `bases` records are silently migrated to
   * `kind:"collection"` here, and — unlike every other read — that migration
   * DOES persist, exactly once, even under overlapping callers (see
   * `_migrationInFlight`). `generated.instanceChecksum` must be pinned to the
   * vault file as it exists at migration time; recomputing it on every read
   * (to stay "read-only") would make a pre-upgrade hand edit invisible
   * forever, defeating T3.3's drift detection. Do NOT "fix" this back to a
   * pure read — see src/store/migrateLegacyBases.ts for the full rationale.
   *
   * Never rejects because of a migration persist failure: this method is
   * treated as an infallible read by every caller except CatalogService, so a
   * failed write degrades to returning the in-memory migrated records and
   * logging the error (see `_readAndMigrate`) — the migration is idempotent,
   * so it simply retries on the next call to getViews().
   */
  async getViews(): Promise<Record<string, ViewRecord>> {
    if (this._migrationInFlight !== null) {
      return this._migrationInFlight;
    }

    const inFlight = this._readAndMigrate();
    this._migrationInFlight = inFlight;
    try {
      return await inFlight;
    } finally {
      this._migrationInFlight = null;
    }
  }

  /**
   * Read, apply defaults, migrate legacy `bases` records (T3.2/ADR-29), and
   * persist the migration if one occurred. A persist failure here is caught
   * and logged rather than propagated — see the getViews() docstring.
   */
  private async _readAndMigrate(): Promise<Record<string, ViewRecord>> {
    const data = await this.readData();
    const raw = data.views ?? {};
    const defaulted: Record<string, ViewRecord> = {};
    for (const [id, entry] of Object.entries(raw)) {
      defaulted[id] = applyDefaults(entry);
    }

    const { views: migrated, changed } = await migrateLegacyBases(defaulted, this.migrationDeps);
    if (changed) {
      try {
        await this.port.save({ ...data, views: migrated });
      } catch (e) {
        console.error("[StoryForge] view store migration persist failed; will retry on next read", e);
      }
    }

    return migrated;
  }

  /**
   * Upserts a view record. Read-modify-write; preserves sibling `settings`.
   * Persists exactly once. — ADR-6 mutation path.
   */
  async setRecord(id: string, rec: ViewRecord): Promise<void> {
    const data = await this.readData();
    const views = data.views ?? {};
    views[id] = rec;
    await this.port.save({ ...data, views });
    this._notify();
  }

  /**
   * Removes a view record by id. Absent id is a safe no-op (still persists once).
   * Read-modify-write; preserves sibling `settings`. — ADR-6 mutation path.
   */
  async deleteRecord(id: string): Promise<void> {
    const data = await this.readData();
    const views = data.views ?? {};
    delete views[id];
    await this.port.save({ ...data, views });
    this._notify();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async readData(): Promise<StoryForgeData> {
    const raw = await this.port.load();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    // raw is narrowed to non-null, non-array object — TypeScript accepts object as StoryForgeData.
    return raw;
  }
}
