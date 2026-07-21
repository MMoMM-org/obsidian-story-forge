/**
 * Shared panel component tests — T3.1 RED phase.
 *
 * Tests DOM structure of each component builder in src/panel/components.ts.
 * All assertions are behavioural: structure, attributes, text — not implementation
 * details.
 */

import { describe, it, expect } from "vitest";
import { augmentEl } from "../__mocks__/obsidian";
import {
	section,
	factRow,
	relationRow,
	linkRow,
	emptyLine,
	unresolvedRow,
	unresolvedEl,
	portraitTile,
	imageTile,
	profileRow,
	taglineLine,
	humanizeFieldLabel,
	factValueEl,
	kindTileEl,
} from "panel/components";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

// ---------------------------------------------------------------------------
// section()
// ---------------------------------------------------------------------------

describe("section()", () => {
	it("header has role=button", () => {
		const { sectionEl } = section(makeContainer(), "Characters");
		const header = sectionEl.querySelector("[role='button']");
		expect(header).not.toBeNull();
	});

	it("header text contains the label", () => {
		const { sectionEl } = section(makeContainer(), "Characters");
		const header = sectionEl.querySelector("[role='button']");
		expect(header?.textContent).toContain("Characters");
	});

	it("aria-expanded is 'true' when not collapsed", () => {
		const { sectionEl } = section(makeContainer(), "Lore");
		const header = sectionEl.querySelector("[role='button']");
		expect(header?.getAttribute("aria-expanded")).toBe("true");
	});

	it("aria-expanded is 'false' when collapsed: true", () => {
		const { sectionEl } = section(makeContainer(), "Lore", { collapsed: true });
		const header = sectionEl.querySelector("[role='button']");
		expect(header?.getAttribute("aria-expanded")).toBe("false");
	});

	it("renders a count badge when count is provided", () => {
		const { sectionEl } = section(makeContainer(), "Characters", { count: 3 });
		const badge = sectionEl.querySelector(".sf-count");
		expect(badge).not.toBeNull();
		expect(badge?.textContent).toContain("3");
	});

	it("does NOT render a count badge when count is absent", () => {
		const { sectionEl } = section(makeContainer(), "Characters");
		const badge = sectionEl.querySelector(".sf-count");
		expect(badge).toBeNull();
	});

	it("body region is present when not collapsed", () => {
		const { bodyEl } = section(makeContainer(), "Characters");
		expect(bodyEl).not.toBeNull();
	});

	it("body region is hidden/marked as collapsed when collapsed: true", () => {
		const { bodyEl } = section(makeContainer(), "Characters", { collapsed: true });
		// Body should either be hidden or have a class marking collapse
		const isHidden =
			bodyEl.getAttribute("aria-hidden") === "true" ||
			bodyEl.classList.contains("sf-sec-body--collapsed") ||
			(bodyEl as HTMLElement).style.display === "none";
		expect(isHidden).toBe(true);
	});

	it("rows appended to bodyEl appear in the section body", () => {
		const { bodyEl } = section(makeContainer(), "Characters");
		const row = augmentEl(document.createElement("div"));
		row.textContent = "test row";
		bodyEl.appendChild(row);
		expect(bodyEl.textContent).toContain("test row");
	});

	it("appends the section to the container", () => {
		const container = makeContainer();
		section(container, "Facts");
		expect(container.querySelector(".sf-section")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// factRow()
// ---------------------------------------------------------------------------

describe("factRow()", () => {
	it("returns an element with class sf-frow", () => {
		const row = factRow(makeContainer(), "role", "protagonist");
		expect(row.classList.contains("sf-frow")).toBe(true);
	});

	it("renders the key text", () => {
		const row = factRow(makeContainer(), "occupation", "Knight");
		expect(row.textContent).toContain("occupation");
	});

	it("renders the value text when a string is passed", () => {
		const row = factRow(makeContainer(), "status", "alive");
		expect(row.textContent).toContain("alive");
	});

	it("renders the value element when an HTMLElement is passed", () => {
		const container = makeContainer();
		const valueEl = document.createElement("span");
		valueEl.textContent = "my link";
		const row = factRow(container, "first_appearance", valueEl);
		expect(row.textContent).toContain("my link");
	});

	it("appends the row to the container", () => {
		const container = makeContainer();
		factRow(container, "role", "protagonist");
		expect(container.querySelector(".sf-frow")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// relationRow()
// ---------------------------------------------------------------------------

describe("relationRow()", () => {
	it("returns an element with class sf-rel", () => {
		const link1 = document.createElement("span");
		link1.textContent = "Mara";
		const row = relationRow(makeContainer(), "family", [link1]);
		expect(row.classList.contains("sf-rel")).toBe(true);
	});

	it("renders the label", () => {
		const link1 = document.createElement("span");
		const row = relationRow(makeContainer(), "allies", [link1]);
		expect(row.textContent).toContain("allies");
	});

	it("renders all link elements", () => {
		const link1 = augmentEl(document.createElement("span"));
		link1.textContent = "Alice";
		const link2 = augmentEl(document.createElement("span"));
		link2.textContent = "Bob";
		const row = relationRow(makeContainer(), "friends", [link1, link2]);
		expect(row.textContent).toContain("Alice");
		expect(row.textContent).toContain("Bob");
	});

	it("appends the row to the container", () => {
		const container = makeContainer();
		const link1 = document.createElement("span");
		relationRow(container, "enemies", [link1]);
		expect(container.querySelector(".sf-rel")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// linkRow()
// ---------------------------------------------------------------------------

describe("linkRow()", () => {
	it("returns an element with class sf-lrow", () => {
		const el = linkRow(makeContainer(), "Scene 1");
		expect(el.classList.contains("sf-lrow")).toBe(true);
	});

	it("contains an element with class sf-lrow-lnk", () => {
		const el = linkRow(makeContainer(), "Scene 1");
		expect(el.querySelector(".sf-lrow-lnk")).not.toBeNull();
	});

	it("link element is focusable (tabIndex >= 0 or role=link or anchor)", () => {
		const el = linkRow(makeContainer(), "Scene 1");
		const lnk = el.querySelector(".sf-lrow-lnk");
		expect(lnk).not.toBeNull();
		const tagName = lnk!.tagName.toLowerCase();
		const tabIndex = (lnk as HTMLElement).tabIndex;
		const isFocusable = tagName === "a" || tagName === "button" || tabIndex >= 0;
		expect(isFocusable).toBe(true);
	});

	it("renders the text", () => {
		const el = linkRow(makeContainer(), "Old Keeper's Vault");
		expect(el.textContent).toContain("Old Keeper's Vault");
	});

	it("renders a trailing tag when tag option is given", () => {
		const el = linkRow(makeContainer(), "Scene 1", { tag: "pov" });
		const trail = el.querySelector(".sf-trail");
		expect(trail).not.toBeNull();
		expect(trail?.textContent).toContain("pov");
	});

	it("does NOT render a trailing tag when tag is absent", () => {
		const el = linkRow(makeContainer(), "Scene 1");
		const trail = el.querySelector(".sf-trail");
		expect(trail).toBeNull();
	});

	it("adds sf-trail--pov to the tag span when tag is 'pov'", () => {
		const el = linkRow(makeContainer(), "Scene 1", { tag: "pov" });
		const trail = el.querySelector(".sf-trail");
		expect(trail?.classList.contains("sf-trail--pov")).toBe(true);
	});

	it("does NOT add sf-trail--pov for a non-pov tag", () => {
		const el = linkRow(makeContainer(), "Scene 1", { tag: "char" });
		const trail = el.querySelector(".sf-trail");
		expect(trail?.classList.contains("sf-trail--pov")).toBe(false);
	});

	it("calls onClick when provided and link is clicked", () => {
		let called = false;
		const el = linkRow(makeContainer(), "Scene 1", { onClick: () => { called = true; } });
		const lnk = el.querySelector(".sf-lrow-lnk") as HTMLElement;
		lnk.click();
		expect(called).toBe(true);
	});

	it("calls onClick when Enter key is pressed on the link", () => {
		let called = false;
		const el = linkRow(makeContainer(), "Scene 1", { onClick: () => { called = true; } });
		const lnk = el.querySelector(".sf-lrow-lnk") as HTMLElement;
		lnk.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(called).toBe(true);
	});

	it("calls onClick when Space key is pressed on the link", () => {
		let called = false;
		const el = linkRow(makeContainer(), "Scene 1", { onClick: () => { called = true; } });
		const lnk = el.querySelector(".sf-lrow-lnk") as HTMLElement;
		lnk.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		expect(called).toBe(true);
	});

	it("appends the row to the container", () => {
		const container = makeContainer();
		linkRow(container, "Scene 1");
		expect(container.querySelector(".sf-lrow")).not.toBeNull();
	});

	it("stamps data-sf-link on the link element when path is provided (T4.2)", () => {
		const el = linkRow(makeContainer(), "Scene 1", { path: "Scene 1.md" });
		const lnk = el.querySelector(".sf-lrow-lnk") as HTMLElement;
		expect(lnk.getAttribute("data-sf-link")).toBe("Scene 1.md");
	});

	it("does NOT stamp data-sf-link when path is absent (T4.2)", () => {
		const el = linkRow(makeContainer(), "Scene 1");
		const lnk = el.querySelector(".sf-lrow-lnk") as HTMLElement;
		expect(lnk.hasAttribute("data-sf-link")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// emptyLine()
// ---------------------------------------------------------------------------

describe("emptyLine()", () => {
	it("returns an element with the exact text", () => {
		const el = emptyLine(makeContainer(), "No scenes yet.");
		expect(el.textContent).toBe("No scenes yet.");
	});

	it("has class sf-emptyline", () => {
		const el = emptyLine(makeContainer(), "No relations.");
		expect(el.classList.contains("sf-emptyline")).toBe(true);
	});

	it("appends the element to the container", () => {
		const container = makeContainer();
		emptyLine(container, "No scenes yet.");
		expect(container.querySelector(".sf-emptyline")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// unresolvedRow()
// ---------------------------------------------------------------------------

describe("unresolvedRow()", () => {
	it("has aria-disabled='true'", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		expect(el.getAttribute("aria-disabled")).toBe("true");
	});

	it("is NOT a clickable link (no anchor with href, no button)", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		const anchors = el.querySelectorAll("a[href]");
		const buttons = el.querySelectorAll("button");
		expect(anchors.length + buttons.length).toBe(0);
	});

	it("contains the link text", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		expect(el.textContent).toContain("Old Keeper's Oath");
	});

	it("contains '(Unresolved)' text", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		expect(el.textContent).toContain("(Unresolved)");
	});

	it("contains the ⊘ glyph", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		expect(el.textContent).toContain("⊘");
	});

	it("has class sf-unres", () => {
		const el = unresolvedRow(makeContainer(), "Old Keeper's Oath");
		expect(el.classList.contains("sf-unres")).toBe(true);
	});

	it("appends the element to the container", () => {
		const container = makeContainer();
		unresolvedRow(container, "Old Keeper's Oath");
		expect(container.querySelector(".sf-unres")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// unresolvedEl()
// ---------------------------------------------------------------------------

describe("unresolvedEl()", () => {
	it("returns an element with class sf-unres", () => {
		const el = unresolvedEl("Ghost Link");
		expect(el.classList.contains("sf-unres")).toBe(true);
	});

	it("has aria-disabled='true'", () => {
		const el = unresolvedEl("Ghost Link");
		expect(el.getAttribute("aria-disabled")).toBe("true");
	});

	it("contains the link text", () => {
		const el = unresolvedEl("Ghost Link");
		expect(el.textContent).toContain("Ghost Link");
	});

	it("contains '(Unresolved)' text", () => {
		const el = unresolvedEl("Ghost Link");
		expect(el.textContent).toContain("(Unresolved)");
	});

	it("contains the ⊘ glyph", () => {
		const el = unresolvedEl("Ghost Link");
		expect(el.textContent).toContain("⊘");
	});

	it("does NOT append to any container (standalone)", () => {
		const container = makeContainer();
		unresolvedEl("Ghost Link");
		// Nothing should have been appended
		expect(container.querySelector(".sf-unres")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// portraitTile()
// ---------------------------------------------------------------------------

describe("portraitTile()", () => {
	it("has class sf-portrait", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway");
		expect(el.classList.contains("sf-portrait")).toBe(true);
	});

	it("renders monogram (initials) when image is empty string", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway", "");
		// No img element
		const img = el.querySelector("img");
		expect(img).toBeNull();
		// Has initials
		expect(el.textContent?.trim()).toMatch(/^[A-Z]{1,2}$/);
	});

	it("renders monogram when image is undefined", () => {
		const el = portraitTile(makeContainer(), "Ada Lovelace");
		const img = el.querySelector("img");
		expect(img).toBeNull();
		expect(el.textContent?.trim()).toMatch(/^[A-Z]{1,2}$/);
	});

	it("monogram uses initials from name (first letters of first two words)", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway");
		expect(el.textContent?.trim()).toBe("MS");
	});

	it("monogram for single-word name uses one initial", () => {
		const el = portraitTile(makeContainer(), "Gandalf");
		expect(el.textContent?.trim()).toBe("G");
	});

	it("does not throw when name is empty string (monogram is empty)", () => {
		expect(() => portraitTile(makeContainer(), "")).not.toThrow();
		const el = portraitTile(makeContainer(), "");
		// empty name produces empty/whitespace monogram — no crash
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("renders an img when image is set (non-empty string)", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway", "portrait.png");
		const img = el.querySelector("img");
		expect(img).not.toBeNull();
	});

	it("img has alt equal to the name (XSS-safe, no broken img)", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway", "portrait.png");
		const img = el.querySelector("img");
		expect(img?.getAttribute("alt")).toBe("Mara Stoneway");
	});

	it("element has aria-label equal to the name when no image", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway", "");
		expect(el.getAttribute("aria-label")).toBe("Mara Stoneway");
	});

	it("element or img has aria-label/alt equal to name when image is set", () => {
		const el = portraitTile(makeContainer(), "Mara Stoneway", "portrait.png");
		const img = el.querySelector("img");
		const hasLabel = img?.getAttribute("alt") === "Mara Stoneway" ||
			el.getAttribute("aria-label") === "Mara Stoneway";
		expect(hasLabel).toBe(true);
	});

	it("appends the element to the container", () => {
		const container = makeContainer();
		portraitTile(container, "Mara Stoneway");
		expect(container.querySelector(".sf-portrait")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// imageTile()
// ---------------------------------------------------------------------------

describe("imageTile()", () => {
	it("returns null when image is empty string", () => {
		const result = imageTile(makeContainer(), "");
		expect(result).toBeNull();
	});

	it("returns null when image is undefined", () => {
		const result = imageTile(makeContainer(), undefined);
		expect(result).toBeNull();
	});

	it("returns an HTMLElement when image is set", () => {
		const el = imageTile(makeContainer(), "map.png");
		expect(el).not.toBeNull();
		expect(el instanceof HTMLElement).toBe(true);
	});

	it("returned element has class sf-imgtile", () => {
		const el = imageTile(makeContainer(), "map.png");
		expect(el?.classList.contains("sf-imgtile")).toBe(true);
	});

	it("does NOT append to container when image is empty", () => {
		const container = makeContainer();
		imageTile(container, "");
		expect(container.querySelector(".sf-imgtile")).toBeNull();
	});

	it("appends the element to the container when image is set", () => {
		const container = makeContainer();
		imageTile(container, "map.png");
		expect(container.querySelector(".sf-imgtile")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// profileRow()
// ---------------------------------------------------------------------------

describe("profileRow()", () => {
	it("returns an element with class sf-profile", () => {
		const tile = augmentEl(document.createElement("div"));
		const el = profileRow(makeContainer(), tile, ["role"]);
		expect(el.classList.contains("sf-profile")).toBe(true);
	});

	it("contains the passed tile element", () => {
		const tile = augmentEl(document.createElement("div"));
		tile.className = "sf-portrait";
		const el = profileRow(makeContainer(), tile, ["role"]);
		expect(el.querySelector(".sf-portrait")).toBe(tile);
	});

	it("renders a sf-pinfo container", () => {
		const tile = augmentEl(document.createElement("div"));
		const el = profileRow(makeContainer(), tile, ["role"]);
		expect(el.querySelector(".sf-pinfo")).not.toBeNull();
	});

	it("renders each string line as a sf-pinfo-line", () => {
		const tile = augmentEl(document.createElement("div"));
		const el = profileRow(makeContainer(), tile, ["protagonist", "age 19"]);
		const lines = el.querySelectorAll(".sf-pinfo-line");
		expect(lines.length).toBe(2);
		expect(lines[0]?.textContent).toBe("protagonist");
		expect(lines[1]?.textContent).toBe("age 19");
	});

	it("gives the FIRST line an extra sf-lead class", () => {
		const tile = augmentEl(document.createElement("div"));
		const el = profileRow(makeContainer(), tile, ["protagonist", "age 19"]);
		const lines = el.querySelectorAll(".sf-pinfo-line");
		expect(lines[0]?.classList.contains("sf-lead")).toBe(true);
		expect(lines[1]?.classList.contains("sf-lead")).toBe(false);
	});

	it("appends an HTMLElement line as-is inside the pinfo line", () => {
		const tile = augmentEl(document.createElement("div"));
		const b = document.createElement("b");
		b.textContent = "Spark";
		const el = profileRow(makeContainer(), tile, [b]);
		expect(el.querySelector(".sf-pinfo-line b")?.textContent).toBe("Spark");
	});

	it("appends the profile to the container", () => {
		const container = makeContainer();
		const tile = augmentEl(document.createElement("div"));
		profileRow(container, tile, ["x"]);
		expect(container.querySelector(".sf-profile")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// taglineLine()
// ---------------------------------------------------------------------------

describe("taglineLine()", () => {
	it("returns an element with class sf-tagline", () => {
		const el = taglineLine(makeContainer(), "A quiet hero.");
		expect(el.classList.contains("sf-tagline")).toBe(true);
	});

	it("wraps the text in straight quotes", () => {
		const el = taglineLine(makeContainer(), "A quiet hero.");
		expect(el.textContent).toBe('"A quiet hero."');
	});

	it("appends the element to the container", () => {
		const container = makeContainer();
		taglineLine(container, "hi");
		expect(container.querySelector(".sf-tagline")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// humanizeFieldLabel()
// ---------------------------------------------------------------------------

describe("humanizeFieldLabel()", () => {
	it("maps distinctive_features to 'features'", () => {
		expect(humanizeFieldLabel("distinctive_features")).toBe("features");
	});

	it("maps first_appearance to 'first seen'", () => {
		expect(humanizeFieldLabel("first_appearance")).toBe("first seen");
	});

	it("maps locationType to 'type'", () => {
		expect(humanizeFieldLabel("locationType")).toBe("type");
	});

	it("maps significant_other to 'partner'", () => {
		expect(humanizeFieldLabel("significant_other")).toBe("partner");
	});

	it("maps magical_abilities to 'magic'", () => {
		expect(humanizeFieldLabel("magical_abilities")).toBe("magic");
	});

	it("maps combat_skills to 'combat'", () => {
		expect(humanizeFieldLabel("combat_skills")).toBe("combat");
	});

	it("falls back to replacing underscores with spaces", () => {
		expect(humanizeFieldLabel("some_other_field")).toBe("some other field");
	});

	it("falls back to replacing hyphens with spaces", () => {
		expect(humanizeFieldLabel("some-field")).toBe("some field");
	});

	it("leaves a plain single-word label unchanged", () => {
		expect(humanizeFieldLabel("region")).toBe("region");
	});
});

// ---------------------------------------------------------------------------
// factValueEl()
// ---------------------------------------------------------------------------

describe("factValueEl()", () => {
	it("returns a plain sf-frow-v span for a non-wikilink string", () => {
		const el = factValueEl("harbour mole");
		expect(el.classList.contains("sf-frow-v")).toBe(true);
		expect(el.textContent).toBe("harbour mole");
	});

	it("returns a stamped link for a [[Target]] wikilink", () => {
		const el = factValueEl("[[Scene 1 - The Extinguished Fire]]");
		expect(el.classList.contains("sf-lrow-lnk")).toBe(true);
		expect(el.getAttribute("data-sf-link")).toBe("Scene 1 - The Extinguished Fire");
		// Displayed text strips the brackets.
		expect(el.textContent).toBe("Scene 1 - The Extinguished Fire");
	});

	it("uses the alias as display text for [[Target|Alias]] and stamps the target", () => {
		const el = factValueEl("[[Scene 1 - The Extinguished Fire|Scene 1]]");
		expect(el.getAttribute("data-sf-link")).toBe("Scene 1 - The Extinguished Fire");
		expect(el.textContent).toBe("Scene 1");
	});

	it("handles a single-entry array whose only entry is a wikilink", () => {
		const el = factValueEl(["[[Moonharbor]]"]);
		expect(el.getAttribute("data-sf-link")).toBe("Moonharbor");
		expect(el.textContent).toBe("Moonharbor");
	});

	it("renders a plain span for a non-string value", () => {
		const el = factValueEl(19);
		expect(el.classList.contains("sf-frow-v")).toBe(true);
		expect(el.textContent).toBe("19");
	});
});

// ---------------------------------------------------------------------------
// kindTileEl()
// ---------------------------------------------------------------------------

describe("kindTileEl()", () => {
	it("returns an element with class sf-imgtile and variant sf-imgtile--loc for location", () => {
		const el = kindTileEl("location");
		expect(el.classList.contains("sf-imgtile")).toBe(true);
		expect(el.classList.contains("sf-imgtile--loc")).toBe(true);
	});

	it("returns variant sf-imgtile--obj for object", () => {
		const el = kindTileEl("object");
		expect(el.classList.contains("sf-imgtile--obj")).toBe(true);
	});

	it("renders the location glyph 🏛 when no image is set", () => {
		const el = kindTileEl("location");
		const glyph = el.querySelector(".sf-imgtile-glyph");
		expect(glyph?.textContent).toBe("🏛");
		expect(el.querySelector("img")).toBeNull();
	});

	it("renders the object glyph 🔮 when no image is set", () => {
		const el = kindTileEl("object");
		const glyph = el.querySelector(".sf-imgtile-glyph");
		expect(glyph?.textContent).toBe("🔮");
	});

	it("renders an img (no glyph) when an image is set", () => {
		const el = kindTileEl("location", "imgs/lighthouse.png");
		const img = el.querySelector("img.sf-imgtile-img") as HTMLImageElement | null;
		expect(img).not.toBeNull();
		expect(img?.src).toContain("lighthouse.png");
		expect(el.querySelector(".sf-imgtile-glyph")).toBeNull();
	});
});
