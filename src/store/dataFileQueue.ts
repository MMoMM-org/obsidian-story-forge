/**
 * One save queue for data.json (spec 010 T2.2).
 *
 * Settings, ViewStore and (later) ArtifactStore all read-modify-write the same blob. Run
 * unserialised, two saves that start together both load the old blob and the second save drops
 * the first change. Every read and every update goes through one promise chain here, so each
 * read-modify-write sees the result of the one before it.
 *
 * A failing load, mutator or save rejects only its own caller; the chain continues with the next.
 */

import type { PluginDataPort, StoryForgeData } from "store/types";

export interface DataFile {
	/** The current blob, after every update queued before this call. Never persists. */
	read(): Promise<StoryForgeData>;
	/**
	 * Load, apply `mutator` to the blob in place, save. Unknown top-level keys are kept, since the
	 * mutator edits the loaded object rather than building a new one.
	 */
	update(mutator: (data: StoryForgeData) => void): Promise<void>;
}

export function createDataFile(port: PluginDataPort): DataFile {
	let tail: Promise<unknown> = Promise.resolve();

	const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
		const run = tail.then(job, job);
		tail = run.catch(() => undefined);
		return run;
	};

	const load = async (): Promise<StoryForgeData> => {
		const raw = await port.load();
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
		return raw;
	};

	return {
		read: () => enqueue(load),
		update: (mutator) => enqueue(async () => {
			const data = await load();
			mutator(data);
			await port.save(data);
		}),
	};
}
