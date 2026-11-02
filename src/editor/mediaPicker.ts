/**
 * mediaPicker — the production seams for the `Media` control (T5.5).
 *
 * `fieldControls` takes `resolveImage` and `pickImage` as injected functions so
 * the control stays testable without a vault. This is where the real ones are
 * built, per edited note: link resolution is relative to the note the value
 * lives in, exactly as a wikilink in that note is.
 *
 * The picker stores `[[mara.png]]` — built by Obsidian's own
 * `fileToLinktext` — so the value is a wikilink Obsidian keeps correct when the
 * image is renamed, where a path would break silently (SDD/Technical Debt).
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
		pickImage: () => pickImageLink(app, file.path),
	};
}

/** Open the image chooser; resolves to a `[[wikilink]]`, or null if dismissed. */
function pickImageLink(app: App, sourcePath: string): Promise<string | null> {
	return new Promise((resolve) => {
		new ImageSuggestModal(app, sourcePath, resolve).open();
	});
}

class ImageSuggestModal extends FuzzySuggestModal<TFile> {
	private _settled = false;

	constructor(
		app: App,
		private readonly _sourcePath: string,
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
		const text = this.app.metadataCache.fileToLinktext(file, this._sourcePath, false);
		this._settle(`[[${text}]]`);
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
