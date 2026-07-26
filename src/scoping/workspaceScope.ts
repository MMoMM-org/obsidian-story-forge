/**
 * workspaceScope — the M5 scope seam (ADR-4).
 *
 * Derives, from the active note, the workspace scope ({book|plotline|none}) and the set
 * of in-scope scene notes. Reuses ScopingService (classification + resolve/backlinks)
 * rather than re-implementing the reverse-lookup: a book/plotline's scenes are its typed
 * backlinks; a scene scopes to its book; anything else falls back to whole-vault scenes.
 *
 * Structure-agnostic (CON-7): scenes are INCLUDED by kind (tag/type), and notes under
 * DEFAULT_EXCLUDED_FOLDERS are EXCLUDED so template/meta notes never surface. This
 * constant is the placeholder for the future `excludedFolders` settings picker.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-1, ADR-4
 * @ref PRD/F3
 */

import { TFile, type App } from "obsidian";
import { ScopingService } from "./ScopingService";

export type WorkspaceScope =
	| { kind: "book"; ref: TFile }
	| { kind: "plotline"; ref: TFile }
	| { kind: "none" };

export interface ResolvedScope {
	scope: WorkspaceScope;
	scenes: TFile[];
}

/** Folders whose notes are kept out of the views (templates/meta). Future settings picker. */
export const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = ["00 Meta"];

function isExcluded(path: string): boolean {
	return DEFAULT_EXCLUDED_FOLDERS.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

function uniqueByPath(files: TFile[]): TFile[] {
	const seen = new Set<string>();
	const out: TFile[] = [];
	for (const f of files) {
		if (seen.has(f.path)) continue;
		seen.add(f.path);
		out.push(f);
	}
	return out;
}

/** Resolve the active note to a workspace scope + its in-scope scene notes. Never throws. */
export function resolveWorkspaceScope(app: App, activeFile: TFile | null): ResolvedScope {
	const scoping = new ScopingService(app);
	const keep = (scenes: TFile[]): TFile[] => uniqueByPath(scenes).filter((f) => !isExcluded(f.path));

	const wholeVault = (): TFile[] =>
		keep(app.vault.getMarkdownFiles().filter((f) => scoping.classify(f) === "scene"));

	const scenesLinking = (ref: TFile, field: string): TFile[] =>
		keep(
			scoping
				.resolve(ref)
				.backlinks.filter((b) => b.kind === "scene" && b.field === field)
				.map((b) => b.file),
		);

	const none = (): ResolvedScope => ({ scope: { kind: "none" }, scenes: wholeVault() });

	if (!activeFile) return none();

	const ctx = scoping.resolve(activeFile);
	switch (ctx.activeKind) {
		case "book":
			return { scope: { kind: "book", ref: activeFile }, scenes: scenesLinking(activeFile, "book") };
		case "plotline":
			return {
				scope: { kind: "plotline", ref: activeFile },
				scenes: scenesLinking(activeFile, "plotlines"),
			};
		case "scene": {
			const bookLink = ctx.entities.find((e) => e.field === "book" && e.unresolved !== true);
			if (bookLink) {
				return { scope: { kind: "book", ref: bookLink.file }, scenes: scenesLinking(bookLink.file, "book") };
			}
			return none();
		}
		default:
			return none();
	}
}
