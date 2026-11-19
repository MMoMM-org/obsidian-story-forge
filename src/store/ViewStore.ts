/**
 * ViewStore — persistent record of user-managed views.
 *
 * ADR-1: flat Record<id, ViewRecord> in data.json, shared blob with settings.
 * ADR-6: persist ONLY on user-initiated mutations (setRecord/deleteRecord).
 *         Read-modify-write preserving sibling `settings`. Never persist on read.
 */

import { createDataFile, type DataFile } from "store/dataFileQueue";
import { applyDefaults, type PluginDataPort, type ViewRecord } from "store/types";

export class ViewStore {
  private readonly file: DataFile;
  private readonly _subscribers = new Set<() => void>();

  /**
   * Pass the plugin's shared DataFile so view writes queue with settings and artifact writes
   * (T2.2). A bare port gets a queue of its own — fine for a store that is the blob's only writer.
   */
  constructor(port: PluginDataPort | DataFile) {
    this.file = "update" in port ? port : createDataFile(port);
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
   */
  async getViews(): Promise<Record<string, ViewRecord>> {
    const data = await this.file.read();
    const raw = data.views ?? {};
    const defaulted: Record<string, ViewRecord> = {};
    for (const [id, entry] of Object.entries(raw)) {
      defaulted[id] = applyDefaults(entry);
    }
    return defaulted;
  }

  /**
   * Upserts a view record. Read-modify-write; preserves sibling `settings`.
   * Persists exactly once. — ADR-6 mutation path.
   */
  async setRecord(id: string, rec: ViewRecord): Promise<void> {
    await this.file.update((data) => {
      const views = data.views ?? {};
      views[id] = rec;
      data.views = views;
    });
    this._notify();
  }

  /**
   * Removes a view record by id. Absent id is a safe no-op (still persists once).
   * Read-modify-write; preserves sibling `settings`. — ADR-6 mutation path.
   */
  async deleteRecord(id: string): Promise<void> {
    await this.file.update((data) => {
      const views = data.views ?? {};
      delete views[id];
      data.views = views;
    });
    this._notify();
  }
}
