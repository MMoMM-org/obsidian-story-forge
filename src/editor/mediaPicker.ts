/**
 * mediaPicker — the production seams for the `Media` control (T5.5).
 *
 * `fieldControls` takes `resolveImage` and `pickImage` as injected functions so
 * the control stays testable without a vault. This is where the real ones are
 * built, per edited note: link resolution is relative to the note the value
 * lives in, exactly as a wikilink in that note is.
 *
 * The picker stores `[[Art/mara.png]]`, a wikilink with the full vault path.
 * Obsidian keeps it correct when the image is renamed, where a bare path would
 * break silently (SDD/Technical Debt), and Meta Bind's image view can read it.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.5
 * @ref src/panel/assetResolver.ts — the resolver this wraps
 */

import { FuzzySuggestModal, type App, type TFile } from "obsidian";
import type { MediaSeams } from "editor/fieldControls";
import { createLinkedImageResolver } from "panel/assetResolver";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);

/** The Media control's seams for the note `file`. */
export function createMediaSeams(app: App, file: TFile): Required<MediaSeams> {
	return {
		label: file.basename,
		resolveImage: createLinkedImageResolver(app, file.path),
		pickImage: () => pickImageLink(app),
	};
}

/** Open the image chooser; resolves to a `[[wikilink]]`, or null if dismissed. */
function pickImageLink(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		new ImageSuggestModal(app, resolve).open();
	});
}

class ImageSuggestModal extends FuzzySuggestModal<TFile> {
	private _settled = false;

	constructor(
		app: App,
		private readonly _resolve: (link: string | null) => void,
	) {
		super(app);
		this.setPlaceholder("Choose an image");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((f) => IMAGE_EXTENSIONS.has(f.extension.toLowerCase()));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		// The full path, not `fileToLinktext`'s shortest form: Meta Bind's image
		// view reads a link's target as a path from the vault root (upstream #677).
		this._settle(`[[${file.path}]]`);
	}

	/**
	 * Obsidian closes the modal BEFORE it calls `onChooseItem`, so resolving
	 * null here would always win. Deferring one tick lets a real choice settle
	 * first; `_settle` keeps whichever came first.
	 */
	onClose(): void {
		window.setTimeout(() => { this._settle(null); }, 0);
	}

	private _settle(link: string | null): void {
		if (this._settled) return;
		this._settled = true;
		this._resolve(link);
	}
}
