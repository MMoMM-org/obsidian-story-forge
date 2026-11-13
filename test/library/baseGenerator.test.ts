/**
 * baseGenerator.test.ts — T1.4 classify() (renderBase removed in T7.3, unused).
 *
 * Covers:
 *  - classify: the five-row traced table from
 *    [ref: SDD/Implementation Examples — classifying a generated artifact]
 *    and ADR-0003 §Decision point 5.
 *
 * @ref SDD/Implementation Examples (classify() traced walkthrough)
 * @ref ADR-0003 §Decision (two-checksum classification table)
 * @ref ADR-34 (templates rendered whole, never patched)
 */

import { describe, it, expect } from "vitest";
import {
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
