/**
 * libraryShared — what the Library tab's two lists (Collections, Cards) draw and do the same way
 * (spec 008 T7.1b/T7.1c; mockups-library.html L2, L4, P11, P16).
 *
 * Both lists repaint from the stores on every change, so each keeps focus by a `data-focus`
 * key ("kind:id") that survives the repaint. The helpers here are that mechanism and the one
 * add row both lists end with.
 */

import type { LibraryProvenance } from "library/collectionStore";
import type { ViewRecord } from "store/types";

export const PROVENANCE_LABEL: Record<LibraryProvenance, string> = {
	"built-in": "built-in",
	"from-repo": "from repo",
	imported: "imported",
};

/** The engine's product name, as the Library's rows and the Workbench's Source row both say it. */
export const ENGINE_LABEL: Record<ViewRecord["engine"], string> = {
	bases: "Bases",
	"dataview-dql": "Dataview",
	dataviewjs: "DataviewJS",
};

/** The `data-focus` key of whatever has focus inside `host`, or `null`. */
export function focusedKey(host: HTMLElement): string | null {
	const el = activeDocument.activeElement;
	// instanceOf, not instanceof: in a popout the element is of that window's realm (#50).
	return el?.instanceOf(HTMLElement) && host.contains(el) ? (el.dataset["focus"] ?? null) : null;
}

/** Focus the control carrying `key` inside `host`. A null key or a missing control does nothing. */
export function focusByKey(host: HTMLElement, key: string | null): void {
	if (key === null) return;
	host.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus();
}

/**
 * "+ Browse repo…" and "+ Import from vault…". With `browseRepo` the Browse button opens the
 * catalog (T7.2) and is the add row's focus target after a last-row removal (P16); without it the
 * button is the disabled "coming in a future release" control (the Cards list: no Card catalog
 * yet). `noteId` must be unique in the page.
 */
export function paintAddRow(
	host: HTMLElement,
	actions: { importFromVault: () => void; browseRepo?: () => void },
	noteId: string,
): void {
	const add = host.createDiv({ cls: "sf-lb-add" });
	const browse = add.createEl("button", {
		cls: "sf-lb-addbtn",
		text: "+ Browse repo…",
		attr: { type: "button" },
	});
	const { browseRepo } = actions;
	if (browseRepo) {
		browse.dataset["focus"] = "add";
		browse.addEventListener("click", () => browseRepo());
	} else {
		// The visible name stays the accessible name; the reason is a description, not a replacement.
		browse.title = "Coming in a future release";
		browse.setAttribute("aria-describedby", noteId);
		browse.disabled = true;
		add.createSpan({ cls: "sf-lb-sr", text: "Coming in a future release", attr: { id: noteId } });
	}
	const imp = add.createEl("button", {
		cls: "sf-lb-addbtn",
		text: "+ Import from vault…",
		attr: { type: "button" },
	});
	if (!browseRepo) imp.dataset["focus"] = "add";
	imp.addEventListener("click", () => actions.importFromVault());
}
