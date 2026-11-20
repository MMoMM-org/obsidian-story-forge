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
import { App, Component, type TFile } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { createFileClassCache, type OwnedFileClassCache } from "fileclass/fileClassVault";

const FOLDER = "00 Meta/FileClasses";

/** A cache whose events nothing owns: enough for the tests of what it resolves. */
function cacheOver(app: App, folder: () => string = () => FOLDER): OwnedFileClassCache {
	return createFileClassCache(app, folder, () => {});
}

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

describe("createFileClassCache — which FileClass applies (T5.3)", () => {
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
		expect(cacheOver(app).nameFor(note)).toBe("fc-character-custom1");
	});

	it("falls back to the FileClass whose tagNames the note carries", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });
		seed(app, [...SHIPPED, { file: note, tags: ["#canon/location"] }]);

		expect(cacheOver(app).nameFor(note)).toBe("fc-location");
	});

	it("falls back to the FileClass whose filesPaths contains the note", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Tobias", path: "30 Canon/31 Characters/Tobias.md" });
		seed(app, [...SHIPPED, { file: note, frontmatter: { role: "supporting" } }]);

		// No fileClass key and no matching tag — the folder claim is what is left.
		expect(cacheOver(app).nameFor(note)).toBe("fc-character");
	});

	it("applies no FileClass to a note nothing claims", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Scratch", path: "90 Inbox/Scratch.md" });
		seed(app, [...SHIPPED, { file: note, frontmatter: { mood: "restless" } }]);

		// Not an error — tier 2 renders the note's own keys instead.
		expect(cacheOver(app).nameFor(note)).toBeUndefined();
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
		expect(cacheOver(app).nameFor(note)).toBeUndefined();
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
		expect(() => cacheOver(app).nameFor(note)).not.toThrow();
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

		expect(cacheOver(app).nameFor(note)).toBeUndefined();
	});

	it("reads a FileClass's frontmatter from the configured folder, live", () => {
		const app = new App();
		seed(app, SHIPPED);
		let folder = "00 Meta/Elsewhere";
		const source = cacheOver(app, () => folder);

		// Wrong folder: nothing to read.
		expect(source.lookup.getFileClassFrontmatter("fc-character")).toBeUndefined();

		// The folder is read per call, so changing the setting needs no reopen.
		folder = FOLDER;
		expect(source.lookup.getFileClassFrontmatter("fc-character")).toMatchObject({
			tagNames: ["canon/character"],
		});
	});
});

// ---------------------------------------------------------------------------
// The cache (T6.4)
// ---------------------------------------------------------------------------

const tagged = createMockTFile({ basename: "Mara", path: "30 Canon/31 Characters/Mara.md" });
const fcFresh = createMockTFile({ basename: "fc-fresh", path: `${FOLDER}/fc-fresh.md` });
const NOTE_TAGS: Note = { file: tagged, tags: ["#canon/hero"] };
/** What a read sees once the FileClass arrives: `fc-fresh` claims the note's tag. */
const AFTER: readonly Note[] = [NOTE_TAGS, { file: fcFresh, frontmatter: { tagNames: ["canon/hero"], fields: [] } }];

interface Reads {
	readonly app: App;
	readonly cache: OwnedFileClassCache;
	scans(): number;
	lookups(path: string): number;
}

function reads(notes: readonly Note[] = [NOTE_TAGS], folder: () => string = () => FOLDER): Reads {
	const app = new App();
	seed(app, notes);
	const cache = cacheOver(app, folder);
	return {
		app,
		cache,
		scans: () => vi.mocked(app.vault.getMarkdownFiles).mock.calls.length,
		lookups: (path) => vi.mocked(app.vault.getAbstractFileByPath).mock.calls.filter(([p]) => p === path).length,
	};
}

/** Prime the cache as empty, swap the vault's contents, fire `fire`, and read again. */
function afterEvent(fire: (app: App) => void): { name: string | undefined; declared: unknown } {
	const { app, cache } = reads();
	expect(cache.nameFor(tagged)).toBeUndefined();
	expect(cache.lookup.getFileClassFrontmatter("fc-fresh")).toBeUndefined();
	seed(app, AFTER);
	fire(app);
	return { name: cache.nameFor(tagged), declared: cache.lookup.getFileClassFrontmatter("fc-fresh") };
}

describe("createFileClassCache — one read per generation", () => {
	it("scans the vault once however many notes ask", () => {
		const others = [1, 2, 3].map((i) => createMockTFile({ basename: `N${i}`, path: `30 Canon/N${i}.md` }));
		const r = reads([...SHIPPED, ...others.map((file) => ({ file, tags: ["#canon/character"] }))]);

		const names = others.map((note) => r.cache.nameFor(note));

		expect(names).toEqual(["fc-character", "fc-character", "fc-character"]);
		expect(r.scans()).toBe(1);
	});

	it("reads one FileClass file once however often it is asked for", () => {
		const r = reads(SHIPPED);

		r.cache.lookup.getFileClassFrontmatter("fc-character");
		r.cache.lookup.getFileClassFrontmatter("fc-character");

		expect(r.lookups(fcCharacter.path)).toBe(1);
	});

	it("remembers that a FileClass is not there", () => {
		const r = reads(SHIPPED);

		r.cache.lookup.getFileClassFrontmatter("fc-gone");
		expect(r.cache.lookup.getFileClassFrontmatter("fc-gone")).toBeUndefined();

		expect(r.lookups(`${FOLDER}/fc-gone.md`)).toBe(1);
	});

	it("keeps following a note's own tags, which no event of its own clears", () => {
		const r = reads(SHIPPED);
		const note = createMockTFile({ basename: "Harbor", path: "30 Canon/Harbor.md" });
		seed(r.app, [...SHIPPED, { file: note, tags: ["#canon/character"] }]);
		expect(r.cache.nameFor(note)).toBe("fc-character");

		seed(r.app, [...SHIPPED, { file: note, tags: ["#canon/location"] }]);

		expect(r.cache.nameFor(note)).toBe("fc-location");
	});
});

describe("createFileClassCache — invalidation", () => {
	const inFolder = fcFresh;
	const outside = createMockTFile({ basename: "fc-fresh", path: "90 Drafts/fc-fresh.md" });

	it.each<[string, (app: App) => void]>([
		["metadataCache changed in the folder", (app) => { app.metadataCache._trigger("changed", inFolder); }],
		["vault create in the folder", (app) => { app.vault._trigger("create", inFolder); }],
		["vault delete in the folder", (app) => { app.vault._trigger("delete", inFolder); }],
		["vault rename within the folder", (app) => { app.vault._trigger("rename", inFolder, `${FOLDER}/old.md`); }],
		["vault rename into the folder", (app) => { app.vault._trigger("rename", inFolder, "90 Drafts/fc-fresh.md"); }],
		["vault rename out of the folder", (app) => { app.vault._trigger("rename", outside, inFolder.path); }],
		["vault rename of the folder itself", (app) => {
			app.vault._trigger("rename", createMockTFile({ basename: "Old", path: "00 Meta/Old" }), FOLDER);
		}],
		["vault delete of the folder itself", (app) => {
			app.vault._trigger("delete", createMockTFile({ basename: "FileClasses", path: FOLDER }));
		}],
		["vault rename of another folder onto the configured path", (app) => {
			app.vault._trigger("rename", createMockTFile({ basename: "FileClasses", path: FOLDER }), "Elsewhere/Classes");
		}],
	])("%s drops both the scan and the lookup", (_label, fire) => {
		const after = afterEvent(fire);

		expect(after.name).toBe("fc-fresh");
		expect(after.declared).toEqual({ tagNames: ["canon/hero"], fields: [] });
	});

	it.each<[string, (app: App) => void]>([
		["metadataCache changed outside", (app) => { app.metadataCache._trigger("changed", tagged); }],
		["vault create outside", (app) => { app.vault._trigger("create", tagged); }],
		["vault delete outside", (app) => { app.vault._trigger("delete", tagged); }],
		["vault rename outside", (app) => { app.vault._trigger("rename", tagged, "30 Canon/Old.md"); }],
		["a sibling folder sharing the prefix", (app) => {
			app.metadataCache._trigger("changed", createMockTFile({ basename: "x", path: `${FOLDER}-old/x.md` }));
		}],
	])("%s keeps them", (_label, fire) => {
		const after = afterEvent(fire);

		expect(after.name).toBeUndefined();
		expect(after.declared).toBeUndefined();
	});

	it("rereads from the new folder when the setting changes, with no event at all", () => {
		const elsewhere = createMockTFile({ basename: "fc-fresh", path: "Elsewhere/fc-fresh.md" });
		let folder = FOLDER;
		const r = reads(
			[...AFTER, { file: elsewhere, frontmatter: { tagNames: [], fields: ["elsewhere"] } }],
			() => folder,
		);
		expect(r.cache.nameFor(tagged)).toBe("fc-fresh");
		expect(r.cache.lookup.getFileClassFrontmatter("fc-fresh")).toMatchObject({ fields: [] });

		folder = "Elsewhere";

		expect(r.cache.lookup.getFileClassFrontmatter("fc-fresh")).toMatchObject({ fields: ["elsewhere"] });
		expect(r.cache.nameFor(tagged)).toBeUndefined();
		expect(r.scans()).toBe(2);
	});

	it("watches the new folder after the setting changes", () => {
		const elsewhere = createMockTFile({ basename: "fc-fresh", path: "Elsewhere/fc-fresh.md" });
		let folder = FOLDER;
		const r = reads([NOTE_TAGS], () => folder);
		r.cache.nameFor(tagged);
		folder = "Elsewhere";
		r.cache.nameFor(tagged);

		seed(r.app, [NOTE_TAGS, { file: elsewhere, frontmatter: { tagNames: ["canon/hero"] } }]);
		r.app.metadataCache._trigger("changed", elsewhere);

		expect(r.cache.nameFor(tagged)).toBe("fc-fresh");
	});

	it("does not keep a read made before Obsidian has indexed the FileClass", () => {
		const r = reads([NOTE_TAGS]);
		// The vault lists the file, the metadata cache has nothing for it yet.
		vi.mocked(r.app.vault.getMarkdownFiles).mockReturnValue([fcFresh, tagged]);
		vi.mocked(r.app.vault.getAbstractFileByPath).mockImplementation((p) => (p === fcFresh.path ? fcFresh : null));
		expect(r.cache.nameFor(tagged)).toBeUndefined();
		expect(r.cache.lookup.getFileClassFrontmatter("fc-fresh")).toBeUndefined();

		// No event: the first index of a file at startup need not send one.
		seed(r.app, AFTER);

		expect(r.cache.nameFor(tagged)).toBe("fc-fresh");
		expect(r.cache.lookup.getFileClassFrontmatter("fc-fresh")).toMatchObject({ tagNames: ["canon/hero"] });
	});

	it("registers every listener through the seam, so its owner releases them", () => {
		const app = new App();
		const owner = new Component();
		const cache = createFileClassCache(app, () => FOLDER, (ref) => { owner.registerEvent(ref); });
		seed(app, [NOTE_TAGS]);
		cache.nameFor(tagged);

		owner._unload();
		seed(app, AFTER);
		app.metadataCache._trigger("changed", fcFresh);
		app.vault._trigger("create", fcFresh);
		app.vault._trigger("delete", fcFresh);
		app.vault._trigger("rename", fcFresh, `${FOLDER}/old.md`);

		expect(cache.nameFor(tagged)).toBeUndefined();
	});
});

describe("createFileClassCache — subscribe", () => {
	it("tells a subscriber once, after a burst of changes in the folder", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			const listener = vi.fn();
			cache.subscribe(listener);

			app.metadataCache._trigger("changed", fcFresh);
			app.vault._trigger("create", fcFresh);
			app.metadataCache._trigger("changed", fcFresh);
			expect(listener).not.toHaveBeenCalled();
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(listener).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("tells nobody about a change outside the folder", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			const listener = vi.fn();
			cache.subscribe(listener);

			app.metadataCache._trigger("changed", tagged);
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(listener).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("still tells the others when one subscriber throws, and logs it", () => {
		vi.useFakeTimers();
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { app, cache } = reads();
			const second = vi.fn();
			cache.subscribe(() => { throw new Error("broken view"); });
			cache.subscribe(second);

			app.metadataCache._trigger("changed", fcFresh);
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(second).toHaveBeenCalledTimes(1);
			expect(logged).toHaveBeenCalledTimes(1);
		} finally {
			logged.mockRestore();
			vi.useRealTimers();
		}
	});

	it("skips a subscriber that left earlier in the same pass", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			const second = vi.fn();
			let leaveSecond = (): void => {};
			cache.subscribe(() => { leaveSecond(); });
			leaveSecond = cache.subscribe(second);

			app.metadataCache._trigger("changed", fcFresh);
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(second).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("cancels a change still pending when it is disposed", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			app.metadataCache._trigger("changed", fcFresh);
			cache.dispose();
			// Subscribed after, so only a cancelled timer keeps it from being told.
			const late = vi.fn();
			cache.subscribe(late);
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(late).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("forgets its subscribers when it is disposed", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			const listener = vi.fn();
			cache.subscribe(listener);

			cache.dispose();
			app.metadataCache._trigger("changed", fcFresh);
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(listener).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops telling a subscriber that left", () => {
		vi.useFakeTimers();
		try {
			const { app, cache } = reads();
			const listener = vi.fn();
			const leave = cache.subscribe(listener);

			app.metadataCache._trigger("changed", fcFresh);
			leave();
			vi.advanceTimersByTime(DEBOUNCE_MS);

			expect(listener).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("createFileClassCache — a FileClass in a subfolder", () => {
	const nested = createMockTFile({ basename: "fc-nested", path: `${FOLDER}/Mine/fc-nested.md` });

	it("that claims a note also resolves, so the claim never points at nothing", () => {
		const app = new App();
		const note = createMockTFile({ basename: "Tern", path: "30 Canon/Tern.md" });
		seed(app, [
			{ file: nested, frontmatter: { tagNames: ["canon/bird"], fields: [] } },
			{ file: note, tags: ["#canon/bird"] },
		]);
		const cache = cacheOver(app);

		const name = cache.nameFor(note);

		expect(name).toBe("fc-nested");
		expect(cache.lookup.getFileClassFrontmatter(name ?? "")).toMatchObject({ tagNames: ["canon/bird"] });
	});

	it("prefers the file directly in the folder over a namesake below it", () => {
		const app = new App();
		const twin = createMockTFile({ basename: "fc-character", path: `${FOLDER}/Mine/fc-character.md` });
		seed(app, [
			{ file: twin, frontmatter: { icon: "below" } },
			{ file: fcCharacter, frontmatter: { icon: "top" } },
		]);

		expect(cacheOver(app).lookup.getFileClassFrontmatter("fc-character")).toMatchObject({ icon: "top" });
	});
});

// T7.4 (PRD F8, mockups-capabilities.html S3/S6): the capability screen's metadata-menu row reads
// how many FileClasses the configured folder holds, through this one cache — no plugin detection.
describe("createFileClassCache — count", () => {
	it("counts the FileClass files in the folder, subfolders included, and nothing outside it", () => {
		const app = new App();
		const nested = createMockTFile({ basename: "fc-nested", path: `${FOLDER}/Fantasy/fc-nested.md` });
		const outside = createMockTFile({ basename: "Mara", path: "30 Canon/Mara.md" });
		seed(app, [...SHIPPED, { file: nested, frontmatter: { fields: [] } }, { file: outside, frontmatter: {} }]);
		expect(cacheOver(app).count()).toBe(SHIPPED.filter((n) => n.file.path.startsWith(`${FOLDER}/`)).length + 1);
	});

	it("ignores notes with no FileClass frontmatter (the value-list notes), so a fresh setup counts 8, not 11", () => {
		const app = new App();
		const lists = ["fc-armor", "fc-combat-skills", "fc-magical-abilities"].map((basename) => ({
			file: createMockTFile({ basename, path: `${FOLDER}/${basename}.md` }),
		}));
		const classes = ["a", "b", "c", "d", "e", "f", "g", "h"].map((basename) => ({
			file: createMockTFile({ basename: `fc-${basename}`, path: `${FOLDER}/fc-${basename}.md` }),
			frontmatter: { limit: 20, fields: [] },
		}));
		seed(app, [...classes, ...lists]);
		expect(cacheOver(app).count()).toBe(8);
	});

	it("is 0 for an empty or missing folder, and follows the folder setting", () => {
		const app = new App();
		seed(app, SHIPPED);
		let folder = "Nowhere";
		const cache = cacheOver(app, () => folder);
		expect(cache.count()).toBe(0);
		folder = FOLDER;
		expect(cache.count()).toBeGreaterThan(0);
	});
});
