/**
 * Fixtures for fileClassReader tests — copied (subset) from the real generated
 * FileClass shape at `test/StoryForge/00 Meta/FileClasses/fc-character.md` and
 * `fc-character-fantasy.md`, so the reader is exercised against actual
 * metadata-menu output rather than an invented shape.
 *
 * Each fixture is the frontmatter object as `app.metadataCache` would hand it
 * to `FileClassLookup.getFileClassFrontmatter` — i.e. already YAML-parsed.
 */

/** Real (trimmed) frontmatter of fc-character.md — the base class, no `extends`. */
export const FC_CHARACTER: Record<string, unknown> = {
	limit: 20,
	mapWithTag: false,
	icon: "user",
	tagNames: ["canon/character"],
	filesPaths: ["30 Canon/31 Characters"],
	extends: undefined,
	version: "3.0",
	fieldsOrder: ["f-type", "f-name", "f-role", "f-status", "f-age", "f-portrait"],
	fields: [
		{
			name: "type",
			type: "Select",
			options: { sourceType: "ValuesList", valuesList: { "1": "character" } },
			path: "",
			id: "f-type",
		},
		{ name: "name", type: "Input", options: {}, path: "", id: "f-name" },
		{
			name: "role",
			type: "Select",
			options: {
				sourceType: "ValuesList",
				valuesList: {
					"1": "protagonist",
					"2": "deuteragonist",
					"3": "antagonist",
					"4": "supporting",
					"5": "minor",
				},
			},
			path: "",
			id: "f-role",
		},
		{
			name: "status",
			type: "Select",
			options: {
				sourceType: "ValuesList",
				valuesList: { "1": "alive", "2": "dead", "3": "missing", "4": "unknown" },
			},
			path: "",
			id: "f-status",
		},
		{ name: "age", type: "Number", options: {}, path: "", id: "f-age" },
		{ name: "portrait", type: "Input", options: {}, path: "", id: "f-portrait" },
	],
};

/**
 * Real (trimmed) frontmatter of fc-character-fantasy.md — extends fc-character,
 * `tagNames`/`filesPaths` are empty (a single blank list item), `fieldsOrder`
 * uses "g-" prefixed ids that map through `fields[].id`, not `fields[].name`.
 */
export const FC_CHARACTER_FANTASY: Record<string, unknown> = {
	limit: 20,
	mapWithTag: false,
	icon: "wand-sparkles",
	tagNames: [""],
	filesPaths: [""],
	extends: "fc-character",
	version: "3.0",
	fieldsOrder: ["g-species", "g-combat_skills", "g-other_skills"],
	fields: [
		{
			name: "species",
			type: "Select",
			options: {
				sourceType: "ValuesList",
				valuesList: {
					"1": "Human",
					"2": "HighElf",
					"3": "DarkElf",
					"4": "WoodElf",
					"5": "Dwarf",
					"6": "Halfling",
					"7": "Orc",
					"8": "Ogre",
				},
			},
			path: "",
			id: "g-species",
		},
		{
			name: "combat_skills",
			type: "Multi",
			options: {
				sourceType: "ValuesListNotePath",
				valuesList: {},
				valuesListNotePath: "00 Meta/FileClasses/fc-combat-skills.md",
			},
			path: "",
			id: "g-combat_skills",
		},
		{
			name: "other_skills",
			type: "Input",
			options: {},
			path: "",
			id: "g-other_skills",
		},
	],
};
