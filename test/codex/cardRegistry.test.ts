/**
 * cardRegistry.test.ts — T4.2 (spec 008-codex-surface, Phase 4).
 *
 * ADR-30: a Card is written **once** against a normalised entry shape and gets
 * both backends — a thin adapter for Bases, one for the native path. What must
 * be proven here is the *contract*, not any Card: that both adapters normalise
 * to the same entry, that the registry's fallback is total, and that a field an
 * entry lacks never reaches the DOM as the literal text `undefined`.
 *
 * Every Card in this file is a **test-local fake**. The three built-in Cards are
 * T4.3 and do not exist yet; binding these tests to Hero's markup would couple
 * the contract's suite to a Card's presentation and break it on every restyle.
 * The split is deliberate: here we prove the registry resolves an unregistered
 * id to *its registered default*; T4.3 proves that default is Hero.
 *
 * The Bases fixture is a plain object carrying the two members `BasesEntry`
 * exposes (`file.path`, `getValue(id): Value | null` — obsidian.d.ts:685-700).
 * Importing Bases typings here would breach CON-6, and a structural fixture is
 * exactly what the adapter is written against.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-30
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import { describe, expect, it, vi } from "vitest";
import { App, createMockTFile } from "../__mocks__/obsidian";
import {
	basesCardEntry,
	createCardRegistry,
	nativeCardEntry,
	type BasesEntryLike,
	type CardEntry,
	type CardRenderDeps,
	type CardRenderer,
} from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { createAssetResolver } from "panel/assetResolver";
import { heroCard } from "codex/cards/heroCard";

// ---------------------------------------------------------------------------
// Fixtures — one note, expressed the way each backend delivers it
// ---------------------------------------------------------------------------

const PATH = "30 Canon/31 Characters/Mara Stoneway.md";
const ROLE = "Protagonist";
const FAMILY = ["[[Tobias Ferro]]", "[[Sera Stoneway]]"];

/** The native backend reads frontmatter: real arrays, real absences. */
function getNativeEntry(overrides?: Record<string, unknown>): CardEntry {
	return nativeCardEntry(PATH, { role: ROLE, family: FAMILY, ...overrides });
}

/**
 * The Bases backend reads `Value` wrappers. `getValue` returns `null` for a
 * property it has no value for, and the only documented accessor is
 * `toString()` — which is why the list arrives comma-joined.
 *
 * A key omitted from `overrides` (or overridden to `null`) is absent from
 * *both* `getValue` and the frontmatter this helper derives — the ordinary
 * "this note doesn't have that property" case every existing test here
 * exercises. The T4.5 tests below construct `frontmatter` by hand instead,
 * because they need the one case this helper cannot express: a key that is
 * in the frontmatter but whose `getValue` is still `null` (blank-but-present).
 */
function getBasesSource(
	overrides?: Record<string, string | null>,
): { source: BasesEntryLike; frontmatter: Record<string, unknown> } {
	const values: Record<string, string | null> = {
		role: ROLE,
		family: FAMILY.join(", "),
		...overrides,
	};
	const frontmatter: Record<string, unknown> = {};
	for (const [id, value] of Object.entries(values)) {
		if (value !== null) frontmatter[id] = value;
	}
	return {
		source: {
			file: { path: PATH },
			getValue: (id: string) => {
				const value = values[id];
				return value == null ? null : { toString: () => value };
			},
		},
		frontmatter,
	};
}

function getBasesEntry(overrides?: Record<string, string | null>): CardEntry {
	const { source, frontmatter } = getBasesSource(overrides);
	return basesCardEntry(source, frontmatter);
}

// ---------------------------------------------------------------------------
// Fake Cards — the contract's consumers, standing in for T4.3
// ---------------------------------------------------------------------------

function getDeps(overrides?: Partial<CardRenderDeps>): CardRenderDeps {
	return {
		compact: false,
		nameEl: (entry: CardEntry): HTMLElement => {
			const node = document.createElement("span");
			node.className = "name";
			node.textContent = entry.name;
			return node;
		},
		// Identity, as the panel renderer suites already stub it. The asset
		// tests below replace it with the *real* resolver over a mock vault.
		resolveAsset: (raw: string): string => raw,
		tileField: nativeTileField,
		...overrides,
	};
}

/** Reads a name, a scalar and a list — the three things every Card reads. */
const echoCard: CardRenderer = {
	id: "echo",
	label: "Echo",
	render(entry, el, deps): void {
		el.appendChild(deps.nameEl(entry));

		const role = document.createElement("span");
		role.className = "role";
		role.textContent = entry.field("role").text;
		el.appendChild(role);

		for (const item of entry.field("family").items) {
			const pill = document.createElement("span");
			pill.className = "pill";
			pill.textContent = item;
			el.appendChild(pill);
		}
	},
};

/**
 * Reads `occupation`, which neither fixture carries unless a test adds it —
 * the F4 case where a Card asks for a property the note does not have.
 */
const occupationCard: CardRenderer = {
	id: "occupation",
	label: "Occupation",
	render(entry, el, deps): void {
		const field = entry.field("occupation");
		const fact = document.createElement("div");
		fact.className = "fact";
		fact.textContent = field.text;
		fact.setAttribute("title", field.text);
		fact.setAttribute("data-present", String(field.present));
		fact.setAttribute("data-items", String(field.items.length));
		el.appendChild(fact);
		el.appendChild(deps.nameEl(entry));
	},
};

/**
 * Hero's image-or-monogram shape, reduced to the seam it depends on: a Card
 * receives a raw frontmatter path (`schema/character.json`'s `portrait` is a
 * plain string) and must never reach into `App`/`Vault` to make it renderable.
 */
const portraitCard: CardRenderer = {
	id: "portrait",
	label: "Portrait",
	render(entry, el, deps): void {
		const src = deps.resolveAsset(entry.field("portrait").text);
		if (src) {
			const img = document.createElement("img");
			// setAttribute, not `.src` — jsdom rewrites the property against the
			// document base URL, which would hide what the seam actually returned.
			img.setAttribute("src", src);
			el.appendChild(img);
		} else {
			const monogram = document.createElement("span");
			monogram.className = "mono";
			monogram.textContent = entry.name.slice(0, 1);
			el.appendChild(monogram);
		}
		el.appendChild(deps.nameEl(entry));
	},
};

function stubCard(id: string, label: string): CardRenderer {
	return { id, label, render: (): void => undefined };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCard(card: CardRenderer, entry: CardEntry): HTMLElement {
	const el = document.createElement("div");
	card.render(entry, el, getDeps());
	return el;
}

/** Every attribute value anywhere under `el` — where a stray `undefined` hides. */
function attributeValues(el: HTMLElement): string[] {
	const values: string[] = [];
	for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
		for (const attr of Array.from(node.attributes)) values.push(attr.value);
	}
	return values;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("card entry adapters", () => {
	it("renders one Card identically from a native entry and a Bases entry", () => {
		const native = renderCard(echoCard, getNativeEntry());
		const bases = renderCard(echoCard, getBasesEntry());

		// The assertion set that matters, stated once and true of both.
		for (const el of [native, bases]) {
			expect(el.querySelector(".name")?.textContent).toBe("Mara Stoneway");
			expect(el.querySelector(".role")?.textContent).toBe(ROLE);
			expect(Array.from(el.querySelectorAll(".pill")).map((p) => p.textContent)).toEqual(FAMILY);
		}
		// …and true of both in exactly the same markup, which is ADR-30's claim.
		expect(native.innerHTML).toBe(bases.innerHTML);
	});

	it("names the entry by its basename, not its path", () => {
		expect(getNativeEntry().name).toBe("Mara Stoneway");
		expect(getBasesEntry().name).toBe("Mara Stoneway");
		expect(getNativeEntry().path).toBe(PATH);
		expect(getBasesEntry().path).toBe(PATH);
	});

	it("distinguishes a blank property from a missing one", () => {
		const blank = renderCard(occupationCard, nativeCardEntry(PATH, { occupation: "" }));
		expect(blank.querySelector(".fact")?.getAttribute("data-present")).toBe("true");

		const missing = renderCard(occupationCard, nativeCardEntry(PATH, {}));
		expect(missing.querySelector(".fact")?.getAttribute("data-present")).toBe("false");
	});

	it("puts no literal 'undefined' in the DOM when a Card reads an absent field", () => {
		for (const entry of [getNativeEntry(), getBasesEntry()]) {
			const el = renderCard(occupationCard, entry);

			expect(el.textContent).not.toContain("undefined");
			expect(attributeValues(el)).not.toContain("undefined");
			expect(el.querySelector(".fact")?.getAttribute("data-present")).toBe("false");
			expect(el.querySelector(".fact")?.getAttribute("data-items")).toBe("0");
		}
	});
});

describe("basesCardEntry — presence from frontmatter, not getValue (T4.5)", () => {
	const KESTREL_PATH = "30 Canon/31 Characters/Kestrel Vane.md";

	function source(getValue: (id: string) => { toString(): string } | null): BasesEntryLike {
		return { file: { path: KESTREL_PATH }, getValue };
	}

	it("renders a blank-but-present property normally — not marked absent", () => {
		// getValue returns null (Bases cannot tell blank from absent on its own),
		// but the frontmatter key IS there — presence must follow the frontmatter.
		const entry = basesCardEntry(source(() => null), { nickname: "" });

		const field = entry.field("nickname");
		expect(field.present).toBe(true);
		expect(field.text).toBe("");
	});

	it("marks a property absent when the frontmatter key truly is not there", () => {
		const entry = basesCardEntry(source(() => null), { role: ROLE });

		expect(entry.field("nickname").present).toBe(false);
		expect(entry.field("nickname").text).toBe("");
	});

	it("treats a note with no frontmatter block (null) as every field absent", () => {
		// Even though getValue would happily return a value, frontmatter === null
		// means the note has none — matches nativeCardEntry(path, null)'s contract.
		const entry = basesCardEntry(source(() => ({ toString: () => ROLE })), null);

		expect(entry.field("role").present).toBe(false);
	});

	it("still takes display text from Value.toString(), not the frontmatter's own value", () => {
		const entry = basesCardEntry(
			source((id) => (id === "role" ? { toString: () => ROLE } : null)),
			{ role: "raw-unformatted-value" },
		);

		expect(entry.field("role").text).toBe(ROLE);
	});

	it("agrees with the native backend on a blank-but-present property", () => {
		const native = nativeCardEntry(KESTREL_PATH, { nickname: "" });
		const bases = basesCardEntry(source(() => null), { nickname: "" });

		expect(bases.field("nickname")).toEqual(native.field("nickname"));
	});
});

describe("card asset resolution", () => {
	/**
	 * Renders through the **real** resolver the panel host uses, over a mock
	 * vault. Stubbing it here would prove only that the seam is callable; the
	 * point of sharing one implementation is that the two surfaces cannot
	 * diverge on image handling, and only the real function shows that.
	 */
	function renderWithVault(entry: CardEntry, app: App): HTMLElement {
		const el = document.createElement("div");
		portraitCard.render(entry, el, getDeps({ resolveAsset: createAssetResolver(app, entry.path) }));
		return el;
	}

	function imageSrc(el: HTMLElement): string | null {
		return el.querySelector("img")?.getAttribute("src") ?? null;
	}

	it("passes a protocol URL through untouched", () => {
		const app = new App();
		const url = "https://example.com/mara.png";
		const el = renderWithVault(getNativeEntry({ portrait: url }), app);

		expect(imageSrc(el)).toBe(url);
		// A URL is not a vault lookup — this guards the early return, which the
		// returned value alone cannot (an absent file also comes back unchanged).
		expect(vi.mocked(app.vault.getAbstractFileByPath)).not.toHaveBeenCalled();
		expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).not.toHaveBeenCalled();
	});

	it("resolves a vault-relative path to its resource URL", () => {
		const app = new App();
		const asset = createMockTFile({ path: "95 Assets/mara.png", basename: "mara" });
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(
			asset as unknown as ReturnType<typeof app.vault.getAbstractFileByPath>,
		);

		const el = renderWithVault(getNativeEntry({ portrait: "95 Assets/mara.png" }), app);

		expect(imageSrc(el)).toBe("app://vault/95 Assets/mara.png");
	});

	it("resolves a bare file name through the vault's own link resolution", () => {
		const app = new App();
		const asset = createMockTFile({ path: "95 Assets/mara.png", basename: "mara" });
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(
			asset as unknown as ReturnType<typeof app.metadataCache.getFirstLinkpathDest>,
		);

		const el = renderWithVault(getNativeEntry({ portrait: "mara.png" }), app);

		expect(imageSrc(el)).toBe("app://vault/95 Assets/mara.png");
		// Resolution is relative to the entry's own note, as a wikilink would be.
		expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).toHaveBeenCalledWith("mara.png", PATH);
	});

	it("resolves a wikilink value (a Media field) to the linked image on the native backend", () => {
		const app = new App();
		const asset = createMockTFile({ path: "95 Assets/mara.png", basename: "mara" });
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(
			asset as unknown as ReturnType<typeof app.metadataCache.getFirstLinkpathDest>,
		);

		const el = renderWithVault(getNativeEntry({ portrait: "[[mara.png]]" }), app);

		expect(imageSrc(el)).toBe("app://vault/95 Assets/mara.png");
		// The brackets must not reach link resolution: Obsidian resolves a link
		// target, never the `[[ ]]` syntax around it.
		expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).toHaveBeenCalledWith("mara.png", PATH);
	});

	it("resolves the same wikilink when it arrives through Bases Value.toString()", () => {
		const app = new App();
		const asset = createMockTFile({ path: "95 Assets/mara.png", basename: "mara" });
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) =>
			link === "mara.png" ? (asset as unknown as ReturnType<typeof app.metadataCache.getFirstLinkpathDest>) : null,
		);
		const entry = basesCardEntry(
			{ file: { path: PATH }, getValue: () => ({ toString: () => "[[mara.png]]" }) },
			{ portrait: "[[mara.png]]" },
		);

		expect(imageSrc(renderWithVault(entry, app))).toBe("app://vault/95 Assets/mara.png");
	});

	it("draws the real Hero Card's tile from a wikilink value", () => {
		const app = new App();
		const asset = createMockTFile({ path: "95 Assets/harbor.png", basename: "harbor" });
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) =>
			link === "harbor.png" ? (asset as unknown as ReturnType<typeof app.metadataCache.getFirstLinkpathDest>) : null,
		);
		const entry = nativeCardEntry("30 Canon/32 Locations/Moonharbor.md", {
			tags: ["canon/location"],
			image: "![[harbor.png|200]]",
		});
		const el = document.createElement("div");
		heroCard.render(
			entry,
			el,
			getDeps({ resolveAsset: createAssetResolver(app, entry.path) }),
		);

		expect(imageSrc(el)).toBe("app://vault/95 Assets/harbor.png");
	});

	it("returns an unresolvable path unchanged rather than blanking the image", () => {
		const el = renderWithVault(getNativeEntry({ portrait: "95 Assets/gone.png" }), new App());

		expect(imageSrc(el)).toBe("95 Assets/gone.png");
	});

	it("falls back to the monogram when the note carries no image", () => {
		for (const portrait of [undefined, "", "   "]) {
			const frontmatter = portrait === undefined ? {} : { portrait };
			const el = renderWithVault(nativeCardEntry(PATH, frontmatter), new App());

			expect(el.querySelector("img")).toBeNull();
			expect(el.querySelector(".mono")?.textContent).toBe("M");
			expect(el.textContent).not.toContain("undefined");
		}
	});
});

describe("card registry", () => {
	it("resolves an unregistered Card id to the registered default", () => {
		const registry = createCardRegistry(echoCard);
		registry.register(stubCard("table", "Table"));

		expect(registry.resolve("no-such-card").id).toBe("echo");
		expect(registry.resolve(undefined).id).toBe("echo");
		expect(registry.resolve(null).id).toBe("echo");
		expect(registry.defaultId).toBe("echo");
	});

	it("resolves a registered id to that Card", () => {
		const registry = createCardRegistry(echoCard);
		registry.register(stubCard("table", "Table"));

		expect(registry.resolve("table").label).toBe("Table");
		expect(registry.resolve("echo").label).toBe("Echo");
	});

	it("keeps the first registration when an id is claimed twice", () => {
		const registry = createCardRegistry(echoCard);

		expect(registry.register(stubCard("table", "Table"))).toBe(true);
		expect(registry.register(stubCard("table", "Impostor"))).toBe(false);
		expect(registry.register(stubCard("echo", "Impostor"))).toBe(false);

		expect(registry.resolve("table").label).toBe("Table");
		expect(registry.resolve("echo").label).toBe("Echo");
	});

	it("lists the default first, then registration order", () => {
		const registry = createCardRegistry(echoCard);
		registry.register(stubCard("table", "Table"));
		registry.register(stubCard("compact", "Compact"));

		expect(registry.list().map((card) => card.id)).toEqual(["echo", "table", "compact"]);
	});
});
