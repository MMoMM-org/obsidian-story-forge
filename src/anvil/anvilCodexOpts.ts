/**
 * anvilCodexOpts — the Anvil's Codex seams, built from the Library (spec 008 T7.1d2).
 *
 * `main.ts` stays lifecycle wiring: it hands this module the Library, the consent gate and the
 * settings it already owns, and gets back what `AnvilViewOpts["codex"]` asks for. The tests build
 * the Anvil from the same function, so the wiring they exercise is the wiring that ships.
 */
import { Notice } from "obsidian";
import type { ConsentGate } from "consent/ConsentGate";
import type { QueryEngine } from "engines/QueryEngine";
import { addableCollections, anvilPills } from "library/collectionStore";
import type { LibraryWiring } from "library/wireLibrary";
import type { ViewRecord } from "store/types";
import type { AnvilViewOpts } from "./AnvilView";

export interface AnvilCodexDeps {
	readonly library: Pick<LibraryWiring, "snapshot" | "onChange" | "collections">;
	readonly getRecord: (id: string) => Promise<ViewRecord | undefined>;
	readonly gate: Pick<ConsentGate, "evaluate" | "requestConsent" | "requestReConsent">;
	/** A fresh engine of the Anvil's own, so a Workbench teardown cannot unload what the Anvil drew. */
	readonly createEngine: (kind: ViewRecord["engine"]) => QueryEngine | undefined;
	readonly getCardByCollection: () => Readonly<Record<string, string>>;
	readonly onCardSelect: (collectionId: string, cardId: string) => void;
	/** Open Settings on the Library tab; `configure` expands that collection's panel (P10). */
	readonly openLibrary: (opts?: { configure?: string }) => void;
}

export function buildAnvilCodexOpts(deps: AnvilCodexDeps): NonNullable<AnvilViewOpts["codex"]> {
	const { library } = deps;
	return {
		// L6a: enabled collections with the Anvil switch on, in Library order.
		getCollections: () => anvilPills(library.snapshot()),
		getCardByCollection: deps.getCardByCollection,
		onCardSelect: deps.onCardSelect,
		// S98 "Change tag" lands on that collection's configure panel (P10).
		onChangeTag: (collectionId) => { deps.openLibrary({ configure: collectionId }); },
		subscribe: (listener) => library.onChange(listener),
		getAddable: () => addableCollections(library.snapshot()),
		onAddToAnvil: async (collectionId) => {
			const outcome = await library.collections.setSurface(collectionId, "anvil", true);
			if (!outcome.ok) new Notice(outcome.reason);
		},
		onManage: () => { deps.openLibrary(); },
		embed: { getRecord: deps.getRecord, gate: deps.gate, createEngine: deps.createEngine },
	};
}
