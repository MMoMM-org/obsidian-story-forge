/**
 * capabilityReport — what the capability screen says about each optional plugin (spec 008 T7.4,
 * PRD F8, ADR-36; mockups-capabilities.html L12a–c, S3/S4/S6).
 *
 * Pure: availability facts in, rows out. Only the three plugins Story Forge's code touches are
 * listed (Bases core; Dataview and metadata-menu community), whatever is present.
 */

import { describe, it, expect } from "vitest";
import { capabilityReport } from "library/capabilityReport";
import type { CapabilityFacts, CapabilityRow } from "library/capabilityReport";

function facts(overrides: Partial<CapabilityFacts> = {}): CapabilityFacts {
	return {
		bases: "enabled",
		dataview: { active: true, jsEnabled: true },
		fileClasses: { count: 9, folder: "00 Meta/FileClasses" },
		...overrides,
	};
}

function row(rows: CapabilityRow[], id: CapabilityRow["id"]): CapabilityRow {
	const r = rows.find((x) => x.id === id);
	if (!r) throw new Error(`no row ${id}`);
	return r;
}

const ABSENT: CapabilityFacts = {
	bases: "disabled",
	dataview: { active: false, jsEnabled: false },
	fileClasses: { count: 0, folder: "00 Meta/FileClasses" },
};

describe("capabilityReport — the rows", () => {
	it("lists Bases (core), Dataview and metadata-menu (community), in that order", () => {
		const rows = capabilityReport(facts());
		expect(rows.map((r) => [r.id, r.name, r.kind])).toEqual([
			["bases", "Bases", "core"],
			["dataview", "Dataview", "community"],
			["metadata-menu", "metadata-menu", "community"],
		]);
	});

	it("every row has a kind, what it adds and what is lost without it", () => {
		for (const r of capabilityReport(facts())) {
			expect(["core", "community"]).toContain(r.kind);
			expect(r.adds.length).toBeGreaterThan(0);
			expect(r.lostWithout.length).toBeGreaterThan(0);
		}
	});

	it("only a core row says where it lives; community rows name no place and no action", () => {
		const rows = capabilityReport(facts());
		expect(row(rows, "bases").where).toBe("Settings › Core plugins › Bases");
		expect(row(rows, "dataview").where).toBeUndefined();
		expect(row(rows, "metadata-menu").where).toBeUndefined();
	});

	it("with everything absent, all three rows are still returned, with the same texts", () => {
		const present = capabilityReport(facts());
		const absent = capabilityReport(ABSENT);
		expect(absent.map((r) => r.id)).toEqual(["bases", "dataview", "metadata-menu"]);
		expect(absent.map((r) => [r.adds, r.lostWithout])).toEqual(present.map((r) => [r.adds, r.lostWithout]));
	});

	it("words each row as the mockup does (L12a)", () => {
		const rows = capabilityReport(facts());
		expect(row(rows, "bases").adds).toEqual([
			"Draws `.base` collections (imported or from the repo) in the Anvil and the Workbench, with the Card you chose.",
			"Adds Story Forge Hero, Table and Compact as view types in your own `.base` files.",
		]);
		expect(row(rows, "bases").lostWithout).toEqual([
			"`.base` collections show \"<name> needs Bases\" instead of their entries.",
			"Bases views in the Workbench fall back to a read-only list, without sorting, filtering or columns.",
			"The four built-in collections, the Workbench and the field editor work the same.",
		]);
		expect(row(rows, "dataview").adds).toEqual([
			"Runs Dataview and DataviewJS collections: the notes you imported, your migrated views, and Dataview entries from the repo.",
		]);
		expect(row(rows, "dataview").lostWithout).toEqual([
			"Those collections do not run. Their Library row and Workbench tab say they need Dataview.",
			"You can still import and install them. They run once Dataview is active.",
			"Built-in and `.base` collections are not affected.",
		]);
		expect(row(rows, "metadata-menu").adds).toEqual([
			"A form for editing FileClasses (`fc-*.md`): which fields a kind of note has, their types, options and order.",
			"Option lists from the FileClasses outside Story Forge too: in Obsidian's Properties panel you pick a value such as _male_ for _gender_ from a list.",
		]);
		expect(row(rows, "metadata-menu").lostWithout).toEqual([
			"Nothing changes in Story Forge. It reads FileClass files itself; Set up story files… writes its own for the eight story types. You edit them as plain notes.",
			"With no FileClasses at all, the editor lists every property under \"Properties\", without sections or option lists.",
			"Obsidian's Properties panel shows plain text fields; option lists exist only in Story Forge's editor.",
		]);
	});
});

describe("capabilityReport — live status (S3)", () => {
	it.each([
		["enabled", "On", "on"],
		["disabled", "Off", "off"],
		["absent", "Not in this Obsidian version", "off"],
	] as const)("Bases %s reads %s", (bases, text, tone) => {
		expect(row(capabilityReport(facts({ bases })), "bases").status).toEqual({ text, tone });
	});

	it("Dataview active reads Active; not active reads Not active", () => {
		expect(row(capabilityReport(facts()), "dataview").status).toEqual({ text: "Active", tone: "on" });
		expect(row(capabilityReport(facts({ dataview: { active: false, jsEnabled: false } })), "dataview").status)
			.toEqual({ text: "Not active", tone: "off" });
	});

	it.each([
		[true, "On"],
		[false, "Off"],
	] as const)("an active Dataview carries its JavaScript setting (%s)", (jsEnabled, value) => {
		expect(row(capabilityReport(facts({ dataview: { active: true, jsEnabled } })), "dataview").sub).toEqual({
			label: "JavaScript queries (DataviewJS):",
			value,
			rest: " in Dataview settings.",
			lost: "Without them, DataviewJS collections show \"DataviewJS disabled\" and do not run.",
		});
	});

	it("a Dataview that is not active has no JavaScript line (its setting can't be read)", () => {
		expect(row(capabilityReport(facts({ dataview: { active: false, jsEnabled: true } })), "dataview").sub).toBeUndefined();
	});

	it.each([
		[9, "9 FileClasses in 00 Meta/FileClasses", "neutral"],
		[1, "1 FileClass in 00 Meta/FileClasses", "neutral"],
		[0, "No FileClasses in 00 Meta/FileClasses", "off"],
	] as const)("metadata-menu shows the FileClasses found: %i", (count, text, tone) => {
		const r = row(capabilityReport(facts({ fileClasses: { count, folder: "00 Meta/FileClasses" } })), "metadata-menu");
		expect(r.status).toEqual({ text, tone });
	});

	it("names the configured FileClasses folder", () => {
		const r = row(capabilityReport(facts({ fileClasses: { count: 2, folder: "Schema/Classes" } })), "metadata-menu");
		expect(r.status.text).toBe("2 FileClasses in Schema/Classes");
	});

	it("absence is never a warning: every status tone is on, off or neutral", () => {
		for (const r of capabilityReport(ABSENT)) expect(["on", "off", "neutral"]).toContain(r.status.tone);
	});

	// L12 amended (user, option B): Bases is read once at load (ADR-8 revised; no public API sees
	// it change at runtime), so the row says so instead of pretending to be live.
	it.each(["enabled", "disabled"] as const)("Bases %s carries the load-time note", (bases) => {
		expect(row(capabilityReport(facts({ bases })), "bases").note)
			.toBe("Read when Story Forge loaded; after turning it on or off, restart Obsidian.");
	});

	it("an Obsidian without Bases has no load-time note, and no other row has one", () => {
		expect(row(capabilityReport(facts({ bases: "absent" })), "bases").note).toBeUndefined();
		const rows = capabilityReport(facts());
		expect(row(rows, "dataview").note).toBeUndefined();
		expect(row(rows, "metadata-menu").note).toBeUndefined();
	});
});

