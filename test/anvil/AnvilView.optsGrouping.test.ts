/**
 * AnvilView.optsGrouping.test.ts — pins the `AnvilViewOpts` grouped-shape
 * contract (spec 008 Phase 4 closeout, "group AnvilViewOpts before Phase 5
 * grows it further").
 *
 * `AnvilViewOpts` moved from ten flat getter/callback fields to four groups
 * (`drill`, the one cross-cutting seam, plus `settings` / `codex` / `bases`).
 * The rest of the suite mostly supplies every field it needs, so it never
 * exercises what happens when a whole group — or part of one — is left out.
 * This file pins exactly that:
 *
 *   1. per-group optionality — a group omitted entirely must behave exactly
 *      as every one of its member fields being absent does today;
 *   2. partial groups — a group present with only SOME members supplied
 *      must still fall back correctly, member by member, for the rest.
 *
 * @ref src/anvil/AnvilView.ts — AnvilViewOpts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView, type AnvilViewOpts } from "anvil/AnvilView";
import { BUILT_IN_COLLECTIONS, CODEX_CARD_BODY_ATTR, type CodexCollection } from "codex/codexTab";
import { CODEX_CARD_SELECT_ATTR } from "codex/cardSelector";
import { CODEX_HINT_DISMISS_ATTR } from "codex/basesHint";
import type { BasesCapability } from "bases/basesCapability";

// ---- a mini canon vault, just enough to render the Codex tab --------------
const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const harbor = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });

function canon(kind: string): CachedMetadata {
	return createMockCachedMetadata({ frontmatter: { tags: [`canon/${kind}`] } });
}

function seedVault(app: App): void {
	const files: readonly TFile[] = [mara, harbor];
	const caches = new Map<TFile, CachedMetadata>([
		[mara, canon("character")],
		[harbor, canon("location")],
	]);
	const byPath = new Map<string, TFile>(files.map((f) => [f.path, f]));

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...files]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return leaf;
}

async function openCodex(app: App, opts: AnvilViewOpts = {}): Promise<AnvilView> {
	const view = new AnvilView(makeLeaf(app), opts);
	await view.onOpen();
	view.setLayout("codex");
	return view;
}

function bodyOf(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}
function pillLabels(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>("[data-sf-collection]")).map(
		(el) => el.textContent ?? "",
	);
}
function cardPaths(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>(`[${CODEX_CARD_BODY_ATTR}]`)).map(
		(el) => el.getAttribute(CODEX_CARD_BODY_ATTR) ?? "",
	);
}
/** The class of `.sf-cx-grid--*` currently on the grid — which Card drew it. */
function gridCardId(view: AnvilView): string | null {
	const grid = bodyOf(view).querySelector(".sf-cx-grid");
	const cls = Array.from(grid?.classList ?? []).find((c) => c.startsWith("sf-cx-grid--"));
	return cls?.replace("sf-cx-grid--", "") ?? null;
}
function hint(view: AnvilView): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(".sf-cx-hint");
}
function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("AnvilViewOpts — grouped shape (spec 008 Phase 4 closeout)", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	describe("settings", () => {
		it("omitting `settings` entirely still drills on click (getLinkClickAction default)", async () => {
			const drill = vi.fn();
			const view = await openCodex(app, { drill });

			click(bodyOf(view).querySelector<HTMLElement>(`[${CODEX_CARD_BODY_ATTR}]`));
			expect(drill).toHaveBeenCalledTimes(1);
			expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		});

		it("a `settings` group with only getExcludedFolders still defaults getLinkClickAction to drill, and the getter takes effect", async () => {
			const drill = vi.fn();
			const view = await openCodex(app, {
				drill,
				settings: { getExcludedFolders: (): readonly string[] => ["30 Canon/32 Locations"] },
			});

			// getLinkClickAction still defaults to "drill" — settings.getLinkClickAction is absent.
			click(bodyOf(view).querySelector<HTMLElement>(`[${CODEX_CARD_BODY_ATTR}]`));
			expect(drill).toHaveBeenCalledTimes(1);
			expect(app.workspace.openLinkText).not.toHaveBeenCalled();

			// getExcludedFolders customization actually took effect — Moonharbor
			// (under the excluded folder) never enters the Locations collection.
			click(bodyOf(view).querySelector('[data-sf-collection="location"]'));
			expect(cardPaths(view)).toEqual([]);
		});
	});

	describe("codex", () => {
		it("omitting `codex` entirely still renders the Codex tab with its documented defaults", async () => {
			const view = await openCodex(app);

			expect(pillLabels(view)).toEqual(
				BUILT_IN_COLLECTIONS.filter((c) => c.enabled).map((c) => c.label),
			);
			expect(gridCardId(view)).toBe("hero");
		});

		it("a `codex` group with only getCollections still falls back for getCardByCollection/onCardSelect", async () => {
			const customCollections: readonly CodexCollection[] = [
				{ id: "character", label: "Cast", tag: "canon/character", enabled: true },
			];
			const view = await openCodex(app, { codex: { getCollections: (): readonly CodexCollection[] => customCollections } });

			expect(pillLabels(view)).toEqual(["Cast"]);
			expect(gridCardId(view)).toBe("hero");

			// onCardSelect defaults to a no-op and getCardByCollection defaults to
			// `{}` on every render — picking a Card must not throw, and since
			// nothing persists the choice, the grid stays on Hero after the pick.
			click(bodyOf(view).querySelector(".sf-cx-cardsel-trigger"));
			expect(() => click(bodyOf(view).querySelector(`[${CODEX_CARD_SELECT_ATTR}="table"]`))).not.toThrow();
			expect(gridCardId(view)).toBe("hero");
		});
	});

	describe("bases", () => {
		it('omitting `bases` entirely shows no hint (getCapability defaults to "enabled")', async () => {
			const view = await openCodex(app);
			expect(hint(view)).toBeNull();
		});

		it("a `bases` group with only getCapability still falls back for getDismissedHints/onDismissHint", async () => {
			const view = await openCodex(app, {
				bases: { getCapability: (): BasesCapability => "disabled" },
			});

			expect(hint(view)).not.toBeNull();

			// onDismissHint defaults to a no-op and getDismissedHints defaults to
			// `[]` on every render — dismissing must not throw, and since nothing
			// persists the dismissal, the hint is still shown after the click.
			const dismissBtn = hint(view)!.querySelector<HTMLElement>(`[${CODEX_HINT_DISMISS_ATTR}]`);
			expect(() => click(dismissBtn)).not.toThrow();
			expect(hint(view)).not.toBeNull();
		});
	});
});
