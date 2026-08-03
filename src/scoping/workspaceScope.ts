/**
 * workspaceScope — the M5 scope seam (ADR-4).
 *
 * Derives, from the active note, the workspace scope ({book|plotline|none}) and the set
 * of in-scope scene notes. Reuses ScopingService (classification + resolve/backlinks)
 * rather than re-implementing the reverse-lookup: a book/plotline's scenes are its typed
 * backlinks; a scene scopes to its book; anything else falls back to whole-vault scenes.
 *
 * Also exports `resolvePlotlineScope` for the Plotgrid read-only view: gathers ALL
 * plotline-type notes in scope (excluding meta folders), resolved as Link objects.
 *
 * Structure-agnostic (CON-7): scenes are INCLUDED by kind (tag/type), and notes under
 * the caller-supplied `excludedFolders` are EXCLUDED so template/meta notes never
 * surface. Both public functions take `excludedFolders` as a parameter (defaulting to
 * `DEFAULT_EXCLUDED_FOLDERS`) rather than reading `PluginSettings.excludedFolders`
 * directly — this module stays a pure scope helper, testable without a plugin
 * instance; callers (AnvilView, SidebarView) thread the live setting through.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-1, ADR-4
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md — T3.5
 * @ref PRD/F3
 */

import { TFile, type App } from "obsidian";
import { ScopingService } from "./ScopingService";
import type { Link } from "../workspace/workspaceModel";
import { DEFAULT_EXCLUDED_FOLDERS } from "../types/index";

export type WorkspaceScope =
	| { kind: "book"; ref: TFile }
	| { kind: "plotline"; ref: TFile }
	| { kind: "none" };

export interface ResolvedScope {
	scope: WorkspaceScope;
	scenes: TFile[];
}

/**
 * Re-exported from `types/index.ts` (the source of truth for `PluginSettings.excludedFolders`)
 * so existing callers importing `DEFAULT_EXCLUDED_FOLDERS` from this module keep working.
 * Kept identical by construction: exactly one literal, defined in `types/index.ts`.
 */
export { DEFAULT_EXCLUDED_FOLDERS };

function isExcluded(path: string, excludedFolders: readonly string[]): boolean {
	return excludedFolders.some((dir) => path === dir || path.startsWith(`${dir}/`));
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

/**
 * Gather ALL plotline-type notes in scope as Link objects (for the Plotgrid read-only
 * coverage view). Each plotline note has `name = file.basename` and `path = file.path`.
 * Notes under DEFAULT_EXCLUDED_FOLDERS are excluded.
 *
 * This is the persistent column set: the Plotgrid will never collapse even if no scene
 * references a given plotline, because columns come from this scope-wide list.
 *
 * @param excludedFolders - folders to exclude (T3.5: PluginSettings.excludedFolders);
 *   defaults to DEFAULT_EXCLUDED_FOLDERS so existing callers are unaffected.
 */
export function resolvePlotlineScope(
	app: App,
	excludedFolders: readonly string[] = DEFAULT_EXCLUDED_FOLDERS,
): Link[] {
	const scoping = new ScopingService(app);
	return app.vault
		.getMarkdownFiles()
		.filter((f) => !isExcluded(f.path, excludedFolders) && scoping.classify(f) === "plotline")
		.map((f) => ({ name: f.basename, path: f.path }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the active note to a workspace scope + its in-scope scene notes. Never throws.
 *
 * @param excludedFolders - folders to exclude (T3.5: PluginSettings.excludedFolders);
 *   defaults to DEFAULT_EXCLUDED_FOLDERS so existing callers are unaffected.
 */
export function resolveWorkspaceScope(
	app: App,
	activeFile: TFile | null,
	excludedFolders: readonly string[] = DEFAULT_EXCLUDED_FOLDERS,
): ResolvedScope {
	const scoping = new ScopingService(app);
	const keep = (scenes: TFile[]): TFile[] =>
		uniqueByPath(scenes).filter((f) => !isExcluded(f.path, excludedFolders));

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
