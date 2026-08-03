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

import { describe, expect, it } from "vitest";
import {
	basesCardEntry,
	createCardRegistry,
	nativeCardEntry,
	type BasesEntryLike,
	type CardEntry,
	type CardRenderDeps,
	type CardRenderer,
} from "codex/cardRegistry";

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
 */
function getBasesSource(overrides?: Record<string, string | null>): BasesEntryLike {
	const values: Record<string, string | null> = {
		role: ROLE,
		family: FAMILY.join(", "),
		...overrides,
	};
	return {
		file: { path: PATH },
		getValue: (id: string) => {
			const value = values[id];
			return value == null ? null : { toString: () => value };
		},
	};
}

function getBasesEntry(overrides?: Record<string, string | null>): CardEntry {
	return basesCardEntry(getBasesSource(overrides));
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
