/**
 * ArtifactStore — install records for shipped vault artifacts, kept in data.json "artifacts".
 *
 * Operational state (CON-5): not a ViewRecord, so the Library and ConsentGate never see it, and
 * not a setting. Reads and writes go through the plugin's shared DataFile queue, so they cannot
 * lose a concurrent settings or view write. Malformed entries are dropped on read (guard per
 * field, like normalizeSettings); a missing key equals {}.
 *
 * @ref SDD/ADR-40
 * @ref SDD/Data Storage Changes
 */

import type { DataFile } from "store/dataFileQueue";
import { ARTIFACT_PLACEHOLDERS, type ArtifactRecord, type ArtifactRecords } from "./artifactTypes";

const SHA256 = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseParams(raw: unknown): ArtifactRecord["params"] | undefined {
	if (!isPlainObject(raw)) return undefined;
	const keys = Object.keys(raw);
	if (keys.length !== ARTIFACT_PLACEHOLDERS.length) return undefined;
	const out: Partial<ArtifactRecord["params"]> = {};
	for (const name of ARTIFACT_PLACEHOLDERS) {
		const value = raw[name];
		if (typeof value !== "string") return undefined;
		out[name] = value;
	}
	return out as ArtifactRecord["params"];
}

/** A well-formed record, or undefined. Unknown extra fields are not carried over. */
export function parseArtifactRecord(raw: unknown): ArtifactRecord | undefined {
	if (!isPlainObject(raw)) return undefined;
	const { path, sourceChecksum, instanceChecksum, pluginVersion } = raw;
	if (typeof path !== "string") return undefined;
	if (typeof sourceChecksum !== "string" || !SHA256.test(sourceChecksum)) return undefined;
	if (typeof instanceChecksum !== "string" || !SHA256.test(instanceChecksum)) return undefined;
	if (typeof pluginVersion !== "string") return undefined;
	const params = parseParams(raw["params"]);
	if (params === undefined) return undefined;
	return { path, sourceChecksum, instanceChecksum, params, pluginVersion };
}

/** Keep the well-formed entries of a raw `artifacts` value; anything else reads as {}. */
export function parseArtifactRecords(raw: unknown): ArtifactRecords {
	const out: ArtifactRecords = {};
	if (!isPlainObject(raw)) return out;
	for (const [id, entry] of Object.entries(raw)) {
		const record = parseArtifactRecord(entry);
		if (record !== undefined) out[id] = record;
	}
	return out;
}

export class ArtifactStore {
	private records: ArtifactRecords = {};
	private readonly listeners = new Set<() => void>();

	constructor(private readonly file: DataFile) {}

	/** Read the records from data.json (queued behind pending writes) and refresh the cache. */
	async load(): Promise<ArtifactRecords> {
		const data = await this.file.read();
		this.records = parseArtifactRecords(data.artifacts);
		return this.records;
	}

	/** Record as of the last load or write. */
	get(id: string): ArtifactRecord | undefined {
		return this.records[id];
	}

	/** All records as of the last load or write. */
	all(): Readonly<ArtifactRecords> {
		return this.records;
	}

	async setRecord(id: string, record: ArtifactRecord): Promise<void> {
		await this.mutate((records) => { records[id] = record; });
	}

	/** Removes the record; an absent id is a no-op (the save still runs). */
	async deleteRecord(id: string): Promise<void> {
		await this.mutate((records) => { delete records[id]; });
	}

	/** Called after every successful write. Returns an unsubscribe function. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private async mutate(edit: (records: ArtifactRecords) => void): Promise<void> {
		let next: ArtifactRecords = {};
		await this.file.update((data) => {
			next = parseArtifactRecords(data.artifacts);
			edit(next);
			data.artifacts = next;
		});
		this.records = next;
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (err) {
				// The data is already saved; a faulty subscriber must not fail the write.
				console.error("[StoryForge] ArtifactStore onChange listener threw", err);
			}
		}
	}
}
