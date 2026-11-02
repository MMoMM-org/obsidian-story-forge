/**
 * mediaPicker.test.ts — T5.5 production seams for the Media control.
 *
 * The control is unit-tested with fake seams; these tests cover the REAL ones:
 * resolving a wikilink target to a loadable URL (or "" when it cannot be), and
 * the image chooser that hands back a `[[wikilink]]` Obsidian keeps correct on
 * rename.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.5
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App, FuzzySuggestModal, createMockTFile, type TFile } from "obsidian";
import { createMediaSeams } from "editor/mediaPicker";

const note = createMockTFile({ basename: "Mara", path: "Characters/Mara.md" });
const png = createMockTFile({ basename: "mara", extension: "png", path: "Art/mara.png" });
const doc = createMockTFile({ basename: "notes", extension: "pdf", path: "Art/notes.pdf" });
const webp = createMockTFile({ basename: "tile", extension: "WEBP", path: "Art/tile.WEBP" });

const opened = FuzzySuggestModal._opened as FuzzySuggestModal<TFile>[];
afterEach(() => { FuzzySuggestModal._reset(); });

function seamsFor(app: App): ReturnType<typeof createMediaSeams> {
	return createMediaSeams(app, note);
}

describe("resolveImage — the production resolver (T5.5)", () => {
	it("returns the vault resource URL for a link that resolves", () => {
		const app = new App();
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(png);
		expect(seamsFor(app).resolveImage("mara.png")).toBe("app://vault/Art/mara.png");
	});

	it("returns an empty string for a target nothing resolves", () => {
		const app = new App();
		expect(seamsFor(app).resolveImage("ghost.png")).toBe("");
	});

	it("passes a web URL through untouched", () => {
		const app = new App();
		expect(seamsFor(app).resolveImage("https://example.com/a.png")).toBe("https://example.com/a.png");
	});
});

describe("pickImage — the image chooser (T5.5)", () => {
	it("offers only image files, extension compared case-insensitively", async () => {
		const app = new App();
		vi.mocked(app.vault.getFiles).mockReturnValue([note, png, doc, webp]);
		const pending = seamsFor(app).pickImage();
		expect(opened).toHaveLength(1);
		expect(opened[0]!.getItems().map((f) => f.path)).toEqual(["Art/mara.png", "Art/tile.WEBP"]);
		opened[0]!._choose(png);
		await pending;
	});

	it("resolves to a [[wikilink]] built by Obsidian from the source note", async () => {
		const app = new App();
		vi.mocked(app.vault.getFiles).mockReturnValue([png]);
		vi.mocked(app.metadataCache.fileToLinktext).mockReturnValue("mara.png");
		const pending = seamsFor(app).pickImage();
		opened[0]!._choose(png);
		await expect(pending).resolves.toBe("[[mara.png]]");
		expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(png, note.path, false);
	});

	it("resolves to null when the chooser is dismissed without a choice", async () => {
		vi.useFakeTimers();
		const app = new App();
		const pending = seamsFor(app).pickImage();
		opened[0]!.close();
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toBeNull();
		vi.useRealTimers();
	});
});
