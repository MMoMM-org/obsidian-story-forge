/**
 * Tests for resolvePlaceholders (src/artifacts/resolvePlaceholders.ts).
 *
 * @ref SDD/ADR-38 (closed placeholder list, explicit and total)
 */

import { describe, it, expect } from "vitest";
import {
	resolvePlaceholders,
	placeholdersIn,
	normalizeFolder,
} from "../../src/artifacts/resolvePlaceholders";
import {
	DEFAULT_ARTIFACT_FOLDERS,
	type ArtifactFolders,
} from "../../src/artifacts/artifactTypes";
import { DEFAULT_FILE_CLASSES_FOLDER } from "../../src/types";

const folders: ArtifactFolders = {
	fileClassesFolder: "Story/Classes",
	templatesFolder: "Story/Templates",
	schemaFolder: "Story/Schema",
};

describe("resolvePlaceholders", () => {
	it("resolves each of the three placeholders", () => {
		expect(resolvePlaceholders("{{sf:fileClassesFolder}}/fc-armor.md", folders)).toBe(
			"Story/Classes/fc-armor.md",
		);
		expect(resolvePlaceholders("{{sf:templatesFolder}}/t.md", folders)).toBe(
			"Story/Templates/t.md",
		);
		expect(resolvePlaceholders("{{sf:schemaFolder}}/s.md", folders)).toBe(
			"Story/Schema/s.md",
		);
	});

	it("resolves repeated and mixed placeholders", () => {
		expect(
			resolvePlaceholders("{{sf:schemaFolder}} {{sf:schemaFolder}} {{sf:templatesFolder}}", folders),
		).toBe("Story/Schema Story/Schema Story/Templates");
	});

	it("passes {{title}}, {{date}} and non-matching braces through", () => {
		const text = "# {{title}} {{date}} {{ sf:fileClassesFolder }} {sf:schemaFolder}";
		expect(resolvePlaceholders(text, folders)).toBe(text);
	});

	it("throws on unknown names, listing every one", () => {
		expect(() => resolvePlaceholders("{{sf:nope}} {{sf:other}} {{sf:nope}}", folders)).toThrow(
			/nope.*other/,
		);
	});

	it("treats any {{sf:…}} as ours, including malformed names", () => {
		expect(() => resolvePlaceholders("{{sf:foo-bar}}", folders)).toThrow(/foo-bar/);
		expect(() => resolvePlaceholders("{{sf:}}", folders)).toThrow(/Unknown/);
	});

	it("normalises folder values without trailing slash", () => {
		const f = { ...folders, schemaFolder: "a/b/" };
		expect(resolvePlaceholders("{{sf:schemaFolder}}", f)).toBe("a/b");
		expect(resolvePlaceholders("{{sf:schemaFolder}}", { ...f, schemaFolder: "/a//b" })).toBe("a/b");
	});

	it("is the identity on text without placeholders", () => {
		const text = "---\nname: x\n---\nplain {{title}}\n";
		expect(resolvePlaceholders(text, folders)).toBe(text);
	});

	it("defaults resolve to the dev-vault layout", () => {
		expect(
			resolvePlaceholders("{{sf:fileClassesFolder}}/fc-armor.md", DEFAULT_ARTIFACT_FOLDERS),
		).toBe("00 Meta/FileClasses/fc-armor.md");
		expect(DEFAULT_ARTIFACT_FOLDERS.fileClassesFolder).toBe(DEFAULT_FILE_CLASSES_FOLDER);
	});
});

describe("placeholdersIn", () => {
	it("returns the distinct used names", () => {
		expect(
			placeholdersIn("{{sf:schemaFolder}} {{sf:fileClassesFolder}} {{sf:schemaFolder}} {{title}}"),
		).toEqual(["schemaFolder", "fileClassesFolder"]);
	});

	it("returns an empty list when none are used", () => {
		expect(placeholdersIn("{{title}}")).toEqual([]);
	});
});

describe("normalizeFolder", () => {
	it("collapses slashes, trims, and replaces non-breaking spaces", () => {
		expect(normalizeFolder("  a//b/  ")).toBe("a/b");
		expect(normalizeFolder("a b/c")).toBe("a b/c");
	});
});
