/**
 * fileClassVault.test.ts — T5.3 (spec 008-codex-surface, Phase 5).
 *
 * Which FileClass applies to a note, and reading it out of the configured
 * folder. The SDD's algorithm calls this `fileClassesApplyingTo(note)` and
 * names two mechanisms (`tagNames` / `filesPaths`); the shipped resolver adds a
 * third and puts it FIRST — the note's own `fileClass` key — because the
 * generated `fc-character-fantasy` claims no tags and no paths, so a chain leaf
 * is otherwise unreachable and S103 could not happen at all.
 *
 * All three orders are pinned here, because a resolution rule that is never
 * exercised is a rule that silently stops working.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Complex Logic, step 1
 */

import { describe, expect, it, vi } from "vitest";
import { App, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { createFileClassSource } from "fileclass/fileClassVault";

const FOLDER = "00 Meta/FileClasses";

const fcCharacter = createMockTFile({ basename: "fc-character", path: `${FOLDER}/fc-character.md` });
const fcLocation = createMockTFile({ basename: "fc-location", path: `${FOLDER}/fc-location.md` });
const fcIsekai = createMockTFile({ basename: "fc-character-custom1", path: `${FOLDER}/fc-character-custom1.md` });

interface Note {
	readonly file: TFile;
	readonly frontmatter?: Record<string, unknown>;
	readonly tags?: string[];
}

function seed(app: App, notes: readonly Note[]): void {
	const caches = new Map<TFile, CachedMetadata>();
	for (const note of notes) {
		caches.set(
			note.file,
			createMockCachedMetadata({
				...(note.frontmatter ? { frontmatter: note.frontmatter } : {}),
				...(note.tags ? { tags: note.tags.map((tag) => ({ tag })) } : {}),
			}),
		);
	}
	const files = notes.map((n) => n.file);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(files);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(
		(p) => files.find((f) => f.path === p) ?? null,
	);
}

/** The two shipped FileClasses, as generated: one claims a tag AND a folder. */
const SHIPPED: readonly Note[] = [
	{
		file: fcCharacter,
		frontmatter: { tagNames: ["canon/character"], filesPaths: ["30 Canon/31 Characters"], fields: [] },
	},
	{ file: fcLocation, frontmatter: { tagNames: ["canon/location"], filesPaths: [], fields: [] } },
	// A user FileClass claiming nothing — and claiming it the way a HAND-WRITTEN
	// one does, by omitting the keys entirely rather than the generated files'
	// single empty item. Both shapes must mean "claims nothing"; an empty claim
	// read as a wildcard would attach this FileClass to every note in the vault.
	{ file: fcIsekai, frontmatter: { extends: "fc-character", fields: [] } },
];

describe("createFileClassSource — which FileClass applies (T5.3)", () => {
	it("prefers the note's own fileClass key, so a user's FileClass is reachable at all", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Mara", path: "30 Canon/31 Characters/Mara.md" });
		seed(app, [
			...SHIPPED,
			{ file: note, frontmatter: { fileClass: "fc-character-custom1" }, tags: ["#canon/character"] },
		]);

		// The note also carries the tag `fc-character` claims and sits in the
		// folder it claims — the explicit key still wins, or a user could never
		// select their own FileClass for a note our tag rule already matches.
		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBe("fc-character-custom1");
	});

	it("falls back to the FileClass whose tagNames the note carries", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });
		seed(app, [...SHIPPED, { file: note, tags: ["#canon/location"] }]);

		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBe("fc-location");
	});

	it("falls back to the FileClass whose filesPaths contains the note", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Tobias", path: "30 Canon/31 Characters/Tobias.md" });
		seed(app, [...SHIPPED, { file: note, frontmatter: { role: "supporting" } }]);

		// No fileClass key and no matching tag — the folder claim is what is left.
		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBe("fc-character");
	});

	it("applies no FileClass to a note nothing claims", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Scratch", path: "90 Inbox/Scratch.md" });
		seed(app, [...SHIPPED, { file: note, frontmatter: { mood: "restless" } }]);

		// Not an error — tier 2 renders the note's own keys instead.
		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBeUndefined();
	});

	it.each<[string, Record<string, unknown>]>([
		["omits the keys", { extends: "fc-character", fields: [] }],
		// What the SHIPPED files actually contain: `tagNames:\n  - ` is a list
		// holding one NULL, not one empty string (fc-character-fantasy.md:5-8).
		// The earlier fixture used [""], which no vault writes, so the string
		// narrowing that stands between this shape and a TypeError had no cover.
		["writes a bare list item, which parses to null", { tagNames: [null], filesPaths: [null], fields: [] }],
		["writes an empty string", { tagNames: [""], filesPaths: [""], fields: [] }],
	])("attaches nothing to an unclaimed note when a FileClass %s", (_shape, frontmatter) => {
		const app = new App();
		const note = createMockTFile({ basename: "Nothing", path: "90 Inbox/Nothing.md" });
		const fcQuiet = createMockTFile({ basename: "fc-quiet", path: `${FOLDER}/fc-quiet.md` });
		seed(app, [{ file: fcQuiet, frontmatter }, { file: note }]);

		// Both shapes mean "claims nothing". Treating either as a wildcard would
		// silently give every note in the vault this FileClass's fields.
		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBeUndefined();
	});

	it("does not render a null claim as a crash — the shipped fc-character-fantasy shape", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Mara", path: "30 Canon/31 Characters/Mara.md" });
		const fcFantasy = createMockTFile({ basename: "fc-character-fantasy", path: `${FOLDER}/fc-character-fantasy.md` });
		seed(app, [
			{ file: fcFantasy, frontmatter: { tagNames: [null], filesPaths: [null], extends: "fc-character", fields: [] } },
			{ file: note, tags: ["#canon/character"] },
		]);

		// Every vault carrying the shipped FileClasses hits this on every render.
		expect(() => createFileClassSource(app, () => FOLDER).nameFor(note)).not.toThrow();
	});

	it("treats only files inside the configured folder as FileClasses", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });
		// A perfectly ordinary note that happens to carry a `tagNames` key —
		// someone's template, or another plugin's metadata. Without the folder
		// filter its basename would be returned as a FileClass name and the pane
		// would try to render fields declared by a note that is not one.
		const impostor = createMockTFile({ basename: "Not a FileClass", path: "20 Planning/Not a FileClass.md" });
		seed(app, [
			{ file: impostor, frontmatter: { tagNames: ["canon/location"], fields: [] } },
			{ file: note, tags: ["#canon/location"] },
		]);

		expect(createFileClassSource(app, () => FOLDER).nameFor(note)).toBeUndefined();
	});

	it("reads a FileClass's frontmatter from the configured folder, live", () => {
		const app = new App();
		seed(app, SHIPPED);
		let folder = "00 Meta/Elsewhere";
		const source = createFileClassSource(app, () => folder);

		// Wrong folder: nothing to read.
		expect(source.lookup.getFileClassFrontmatter("fc-character")).toBeUndefined();

		// The folder is read per call, so changing the setting needs no reopen.
		folder = FOLDER;
		expect(source.lookup.getFileClassFrontmatter("fc-character")).toMatchObject({
			tagNames: ["canon/character"],
		});
	});
});

describe("createFileClassSource — snapshot option", () => {
	function scansFor(options: { snapshot?: boolean }): number {
		const app = new App();
		const notes = [1, 2, 3].map((i) =>
			createMockTFile({ basename: `N${i}`, path: `30 Canon/31 Characters/N${i}.md` }));
		seed(app, [...SHIPPED, ...notes.map((file) => ({ file, tags: ["#canon/character"] }))]);
		const source = createFileClassSource(app, () => FOLDER, options);
		vi.mocked(app.vault.getMarkdownFiles).mockClear();
		notes.forEach((n) => source.nameFor(n));
		return vi.mocked(app.vault.getMarkdownFiles).mock.calls.length;
	}

	it("rescans the vault on every nameFor by default", () => {
		expect(scansFor({})).toBe(3);
	});

	it("scans once for a { snapshot: true } source", () => {
		expect(scansFor({ snapshot: true })).toBe(1);
	});
});
