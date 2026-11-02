/**
 * baseGenerator.test.ts — T1.4 template render + classify().
 *
 * Covers:
 *  - renderBase: whole-file YAML render from CollectionParams (tag +
 *    excludedFolders), never a patch (ADR-34). Output is a structurally
 *    valid BasesConfigFile per the existing validateBasesConfig
 *    (src/bases/basesConfig.ts), which checks views/filters/formulas
 *    presence and shape but does not inspect filters' internals — so
 *    filter-expression correctness (tag substitution, not: exclusions,
 *    space-quoting) is asserted directly against the parsed YAML, not
 *    inferred from validateBasesConfig passing.
 *  - classify: the five-row traced table from
 *    [ref: SDD/Implementation Examples — classifying a generated artifact]
 *    and ADR-0003 §Decision point 5.
 *
 * @ref SDD/Implementation Examples (classify() traced walkthrough)
 * @ref ADR-0003 §Decision (two-checksum classification table)
 * @ref ADR-34 (templates rendered whole, never patched)
 */

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { validateBasesConfig } from "bases/basesConfig";
import {
	renderBase,
	classify,
	type CollectionParams,
	type GeneratedArtifact,
} from "library/baseGenerator";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const getMockParams = (overrides?: Partial<CollectionParams>): CollectionParams => ({
	tag: "story/character",
	excludedFolders: ["00 Meta"],
	...overrides,
});

const getMockArtifact = (overrides?: Partial<GeneratedArtifact>): GeneratedArtifact => ({
	sourceChecksum: "sha256:source-aaa",
	params: getMockParams(),
	instanceChecksum: "sha256:instance-bbb",
	filePath: "00 Meta/Bases/Characters.base",
	verify: true,
	...overrides,
});

// ---------------------------------------------------------------------------
// renderBase — whole-file render
// ---------------------------------------------------------------------------

describe("renderBase", () => {
	it("substitutes the tag into the filter expression", () => {
		const yamlText = renderBase(getMockParams({ tag: "story/location", excludedFolders: [] }));
		const parsed = parseYaml(yamlText) as { filters?: unknown };

		expect(parsed.filters).toBe('file.hasTag("story/location")');
	});

	it("substitutes excluded folders into a not: block", () => {
		const yamlText = renderBase(
			getMockParams({ tag: "story/character", excludedFolders: ["00 Meta", "10 Templates"] }),
		);
		const parsed = parseYaml(yamlText) as {
			filters: { and: [string, { not: string[] }] };
		};

		expect(parsed.filters.and[0]).toBe('file.hasTag("story/character")');
		expect(parsed.filters.and[1].not).toEqual([
			'file.inFolder("00 Meta")',
			'file.inFolder("10 Templates")',
		]);
	});

	it("quotes a folder name containing a space correctly", () => {
		const yamlText = renderBase(
			getMockParams({ tag: "story/character", excludedFolders: ["00 Meta Folder"] }),
		);
		const parsed = parseYaml(yamlText) as {
			filters: { and: [string, { not: string[] }] };
		};

		// The query-language literal must survive a YAML round-trip byte-exact —
		// the space must not truncate or split the expression.
		expect(parsed.filters.and[1].not).toEqual(['file.inFolder("00 Meta Folder")']);
	});

	it("produces no not: block for an empty exclusion list (not an empty one)", () => {
		const yamlText = renderBase(getMockParams({ excludedFolders: [] }));

		expect(yamlText).not.toContain("not:");
		const parsed = parseYaml(yamlText) as { filters?: unknown };
		// filters is the bare tag expression — not wrapped in an `and:` with an
		// empty/absent not-block.
		expect(parsed.filters).toBe('file.hasTag("story/character")');
	});

	it("produces a structurally valid BasesConfigFile (validateBasesConfig) with the tag-only filter shape intact", () => {
		const yamlText = renderBase(getMockParams({ excludedFolders: [] }));
		const parsed = parseYaml(yamlText) as { filters?: unknown };
		const result = validateBasesConfig(parsed);

		// validateBasesConfig only checks presence/array-ness of views/filters/
		// formulas — it does not inspect filters' internal shape. Filter
		// correctness is asserted directly here so the test name doesn't
		// overclaim what the round-trip alone proves.
		expect(result.ok).toBe(true);
		expect(parsed.filters).toBe('file.hasTag("story/character")');
	});

	it("produces a structurally valid BasesConfigFile (validateBasesConfig) with the and/not filter shape intact for multiple excluded folders", () => {
		const yamlText = renderBase(
			getMockParams({ excludedFolders: ["00 Meta", "10 Templates", "Story Bible"] }),
		);
		const parsed = parseYaml(yamlText) as {
			filters: { and: [string, { not: string[] }] };
		};
		const result = validateBasesConfig(parsed);

		expect(result.ok).toBe(true);
		expect(parsed.filters.and[0]).toBe('file.hasTag("story/character")');
		expect(parsed.filters.and[1].not).toEqual([
			'file.inFolder("00 Meta")',
			'file.inFolder("10 Templates")',
			'file.inFolder("Story Bible")',
		]);
	});

	it("includes at least one Bases view so the artifact is independently openable", () => {
		const yamlText = renderBase(getMockParams());
		const parsed = parseYaml(yamlText) as { views?: unknown[] };

		expect(Array.isArray(parsed.views)).toBe(true);
		expect(parsed.views?.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// classify — the five-row traced table (ADR-0003 §Decision)
// ---------------------------------------------------------------------------

describe("classify", () => {
	it("row 1 — nothing happened: source/params/file all match → clean, no prompt", () => {
		const rec = getMockArtifact();

		const state = classify(rec, rec.sourceChecksum, rec.params, rec.instanceChecksum);

		expect(state).toBe("clean");
	});

	it("row 2 — user changes a setting: source same, params differ, file untouched → regenerate (silent)", () => {
		const rec = getMockArtifact();
		const changedParams = getMockParams({ tag: "story/location" });
		// A settings change does not touch the file: it still has the bytes we
		// wrote under the OLD params, so it MATCHES the stored instance checksum.
		const state = classify(rec, rec.sourceChecksum, changedParams, rec.instanceChecksum);

		expect(state).toBe("regenerate");
	});

	it("row 2b — a setting changed AND the file was hand-edited → ask, the edit is never overwritten silently", () => {
		const rec = getMockArtifact();
		const changedParams = getMockParams({ tag: "story/location" });
		const foreignEditChecksum = "sha256:hand-edited";

		const state = classify(rec, rec.sourceChecksum, changedParams, foreignEditChecksum);

		expect(state).toBe("ask");
	});

	it("row 3 — user hand-edits the file: source/params same, file differs → ask", () => {
		const rec = getMockArtifact();
		const foreignEditChecksum = "sha256:hand-edited";

		const state = classify(rec, rec.sourceChecksum, rec.params, foreignEditChecksum);

		expect(state).toBe("ask");
	});

	it("row 4 — catalog update ships a new template: source differs → reconsent", () => {
		const rec = getMockArtifact();

		const state = classify(rec, "sha256:new-template-source", rec.params, rec.instanceChecksum);

		expect(state).toBe("reconsent");
	});

	it("row 4 — reconsent takes priority even when params and file also differ", () => {
		const rec = getMockArtifact();

		const state = classify(
			rec,
			"sha256:new-template-source",
			getMockParams({ tag: "story/location" }),
			"sha256:whatever",
		);

		expect(state).toBe("reconsent");
	});

	it("row 5 — verification switched off: clean regardless of source/params/file", () => {
		const rec = getMockArtifact({ verify: false });

		const state = classify(
			rec,
			"sha256:completely-different-source",
			getMockParams({ tag: "story/anything-else" }),
			"sha256:completely-different-instance",
		);

		expect(state).toBe("clean");
	});

	it("a missing file (fileChecksum null) with unchanged source/params → regenerate, not ask", () => {
		const rec = getMockArtifact();

		const state = classify(rec, rec.sourceChecksum, rec.params, null);

		expect(state).toBe("regenerate");
	});
});
