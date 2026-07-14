/**
 * StubContextTab — M1 stub implementation of ContextTab.
 *
 * Renders NoteContext.entities as field+kind rows using Obsidian DOM factories
 * only (createEl/createDiv/createSpan/setText). No Bases/Dataview engine,
 * no live vault queries — pure data dump for M1.
 *
 * M2 will replace this with real query-engine-backed context tabs.
 *
 * ContextTab contract (from SDD):
 *   id:     string — tab identifier
 *   render: (ctx: NoteContext, el: HTMLElement) => void
 */

import type { NoteContext } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// ContextTab interface
// ---------------------------------------------------------------------------

/** Interface for pluggable context tab renderers (M1: one stub tab; M2+: real engines). */
export interface ContextTab {
	/** Stable tab identifier — used to match tab strip button to body panel. */
	id: string;
	/** Render the context into the given container element. Replace on each call. */
	render(ctx: NoteContext, el: HTMLElement): void;
}

// ---------------------------------------------------------------------------
// Augmented-element helpers (mirrors obsidian.ts augmentEl interface)
// ---------------------------------------------------------------------------

type AugEl = HTMLElement & {
	createDiv(opts?: { cls?: string; text?: string }): AugEl;
	createSpan(opts?: { cls?: string; text?: string }): AugEl;
	empty(): void;
};

function asAug(el: HTMLElement): AugEl {
	return el as AugEl;
}

// ---------------------------------------------------------------------------
// StubContextTab
// ---------------------------------------------------------------------------

export class StubContextTab implements ContextTab {
	readonly id = "context";

	render(ctx: NoteContext, el: HTMLElement): void {
		const root = asAug(el);
		root.empty();

		const rows = root.createDiv({ cls: "sf-rows" });
		for (const entity of ctx.entities) {
			const row = asAug(rows).createDiv({ cls: "sf-row" });
			asAug(row).createSpan({ cls: "sf-f", text: entity.field ?? "" });
			asAug(row).createSpan({ cls: "sf-lnk", text: entity.file.basename });
			asAug(row).createSpan({ cls: "sf-k", text: entity.kind });
		}

		// Backlink seam footer — empty in M1, filled in M3
		root.createDiv({
			cls: "sf-appears",
			text: "appears in: — (M3)",
		});
	}
}
