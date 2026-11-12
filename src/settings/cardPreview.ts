/**
 * cardPreview — the inline preview under a Card row (spec 008 T7.1c; mockups-library.html
 * L5a, L5b and proposal P3).
 *
 * The note is drawn by the same `buildCardWrapper` + registry path the Anvil's Codex grid uses,
 * on the sample note's frontmatter, so the preview is the real Card and not a look-alike. The
 * result is then made inert: a preview is read-only and never navigates, so the markers a host
 * would act on are stripped and the card is not focusable. Nothing here writes.
 */

import type { App } from "obsidian";
import type { CardRegistry } from "codex/cardRegistry";
import { nativeCardEntry } from "codex/cardRegistry";
import { buildCardWrapper, CARD_BODY_ATTR, CARD_NAME_ATTR, CARD_TITLE_ATTR } from "codex/cardWrapper";
import { createCardTileField } from "codex/cardTileField";
import { resolveCollection, type IndexedNote } from "codex/collectionResolver";
import type { LibraryCard, LibraryCollection } from "library/collectionStore";
import type { FileClassSource } from "fileclass/fileClassVault";
import { createLinkedImageResolver } from "panel/assetResolver";

export interface PreviewHost {
	readonly app: App;
	readonly registry: CardRegistry;
	readonly notes: () => readonly IndexedNote[];
	/** The plugin's FileClass cache, so the tile follows the Media field as in the Anvil. Absent: the shipped names. */
	readonly fileClasses?: FileClassSource;
}

/** What one open preview shows: the Card, the collections it can sample, and which is chosen. */
export interface PreviewModel {
	readonly card: LibraryCard;
	readonly options: readonly LibraryCollection[];
	readonly sample: LibraryCollection | undefined;
}

export interface PreviewActions {
	readonly onSample: (collectionId: string) => void;
	readonly onClose: () => void;
}

/** P3: enabled collections a Card can be tried on. Dataview ones ignore Cards (P8), so they are not offered. */
export function sampleOptions(all: readonly LibraryCollection[]): LibraryCollection[] {
	return all.filter((c) => c.enabled && c.engine !== "dataview-dql" && c.engine !== "dataviewjs");
}

/** P3: the chosen collection if still offered, else the first that uses the Card, else the first offered. */
export function pickSample(
	options: readonly LibraryCollection[],
	usedBy: readonly LibraryCollection[],
	chosen: string | undefined,
): LibraryCollection | undefined {
	const byId = (id: string | undefined): LibraryCollection | undefined => options.find((c) => c.id === id);
	return byId(chosen) ?? options.find((c) => usedBy.some((u) => u.id === c.id)) ?? options[0];
}

/** The first note the collection resolves to, or `null` (also when it is misconfigured, which has nothing to draw). */
function firstEntry(c: LibraryCollection, notes: readonly IndexedNote[]): IndexedNote | null {
	const res = resolveCollection(c.id, { [c.id]: { tag: c.tag } }, { excludedFolders: c.excludedFolders }, notes);
	return res.status === "resolved" ? (res.notes[0] ?? null) : null;
}

/** Draw the preview region under a Card row. Focus is the caller's business. */
export function paintPreview(parent: HTMLElement, m: PreviewModel, host: PreviewHost, act: PreviewActions): void {
	const id = m.card.id;
	const region = parent.createDiv({ cls: "sf-lb-prev", attr: { role: "region", "aria-label": `Preview of ${m.card.label}` } });
	paintHead(region, m, act);
	const body = region.createDiv({ cls: "sf-lb-prev-body" });
	paintBody(body, m, host);
	region.createDiv({ cls: "sf-lb-prev-foot", text: "Read-only. Clicks do nothing here. The preview draws the note exactly as the Anvil will." });
	// P3: Esc anywhere inside the region closes it.
	region.addEventListener("keydown", (e) => { if (e.key === "Escape") act.onClose(); });
	region.dataset["previewFor"] = id;
}

function paintHead(region: HTMLElement, m: PreviewModel, act: PreviewActions): void {
	const head = region.createDiv({ cls: "sf-lb-prev-head" });
	head.createEl("b", { text: "Preview" });
	if (m.sample) paintSamplePicker(head, m, act);
	head.createSpan({ cls: "sf-lb-sp" });
	const close = head.createEl("button", { cls: "sf-lb-btn", text: "Close preview", attr: { type: "button", "data-focus": `close:${m.card.id}` } });
	close.addEventListener("click", () => act.onClose());
}

function paintSamplePicker(head: HTMLElement, m: PreviewModel, act: PreviewActions): void {
	const selectId = `sf-lb-sample-${m.card.id}`;
	head.appendText(" · ");
	head.createEl("label", { text: "Sample from", attr: { for: selectId } });
	const pick = head.createEl("select", { cls: "dropdown", attr: { id: selectId, "data-focus": `sample:${m.card.id}` } });
	for (const c of m.options) pick.createEl("option", { text: c.label, value: c.id });
	pick.value = m.sample?.id ?? "";
	pick.addEventListener("change", () => act.onSample(pick.value));
	head.appendText(" · first entry");
}

function paintBody(body: HTMLElement, m: PreviewModel, host: PreviewHost): void {
	if (!m.sample) {
		body.appendText("Enable a collection to preview this Card.");
		return;
	}
	const note = firstEntry(m.sample, host.notes());
	if (!note) {
		body.appendText(`${m.sample.label} has no entries yet, so there is nothing to preview. Choose another collection above.`);
		return;
	}
	body.appendChild(drawInert(note, m.card, host));
}

/** The real Card for `note`, with nothing in it a host could act on. */
function drawInert(note: IndexedNote, card: LibraryCard, host: PreviewHost): HTMLElement {
	const { app } = host;
	const file = app.vault.getFileByPath(note.path);
	const frontmatter = file ? (app.metadataCache.getFileCache(file)?.frontmatter ?? null) : null;
	const el = buildCardWrapper(nativeCardEntry(note.path, frontmatter), host.registry.resolve(card.id), {
		compact: false,
		resolveAsset: createLinkedImageResolver(app, note.path),
		tileField: createCardTileField(host.fileClasses, (path) => app.vault.getFileByPath(path)),
	});
	makeInert(el);
	return el;
}

function makeInert(el: HTMLElement): void {
	for (const attr of [CARD_BODY_ATTR, "role", "tabindex"]) el.removeAttribute(attr);
	el.setAttribute("inert", "");
	for (const node of el.querySelectorAll(`[${CARD_NAME_ATTR}], [${CARD_TITLE_ATTR}]`)) {
		node.removeAttribute(CARD_NAME_ATTR);
		node.removeAttribute(CARD_TITLE_ATTR);
	}
}
