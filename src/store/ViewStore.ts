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
   * DOES persist, exactly once. `generated.instanceChecksum` must be pinned
   * to the vault file as it exists at migration time; recomputing it on every
   * read (to stay "read-only") would make a pre-upgrade hand edit invisible
   * forever, defeating T3.3's drift detection. Do NOT "fix" this back to a
   * pure read — see src/store/migrateLegacyBases.ts for the full rationale.
   */
  async getViews(): Promise<Record<string, ViewRecord>> {
    const data = await this.readData();
    const raw = data.views ?? {};
    const defaulted: Record<string, ViewRecord> = {};
    for (const [id, entry] of Object.entries(raw)) {
      defaulted[id] = applyDefaults(entry);
    }

    const { views: migrated, changed } = await migrateLegacyBases(defaulted, this.migrationDeps);
    if (changed) {
      await this.port.save({ ...data, views: migrated });
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
