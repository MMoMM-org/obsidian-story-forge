/**
 * inspectorFields — static per-kind FieldSpec mappings for the Inspector.
 *
 * Derived from schema/*.json. Provides the FieldSpec[] the InspectorController
 * needs to render editable scalar/enum controls and read-only list/relation fields.
 *
 * These are static (not generated at runtime from the JSON files) to keep the
 * build simple and avoid a runtime schema import. When schema/*.json changes,
 * run `npm run schema:gen` and update these arrays to match.
 *
 * A drift-guard test (test/inspector/inspectorFields.test.ts) loads the canonical
 * schema/*.json files and asserts that every inspectorFields entry matches exactly —
 * future schema edits that drift without updating this file will fail the test.
 *
 * @ref schema/character.json
 * @ref schema/location.json
 * @ref schema/object.json
 * @ref schema/lore.json
 * @ref schema/scene.json
 * @ref schema/plotline.json
 * @ref schema/book.json
 * @ref SDD/ADR-7 — select vocab from schema values
 */

import type { EntityKind } from "scoping/NoteContext";
import type { FieldSpec } from "./frontmatterWriter";

/** Return the Inspector FieldSpec list for a given EntityKind. */
export function inspectorFields(kind: EntityKind): FieldSpec[] {
	return KIND_INSPECTOR_FIELDS[kind] ?? [];
}

/** Per-kind static field configuration, derived from schema/*.json. */
const KIND_INSPECTOR_FIELDS: Partial<Record<EntityKind, FieldSpec[]>> = {
	character: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "aliases", type: "list" },
		{ name: "nickname", type: "text" },
		{ name: "role", type: "select", values: ["protagonist", "deuteragonist", "antagonist", "supporting", "minor"] },
		{ name: "status", type: "select", values: ["alive", "dead", "missing", "unknown"] },
		{ name: "age", type: "number" },
		{ name: "gender", type: "select", values: ["male", "female", "diverse", "nonbinary"] },
		{ name: "occupation", type: "text" },
		{ name: "height", type: "number" },
		{ name: "build", type: "text" },
		{ name: "hair", type: "text" },
		{ name: "eyes", type: "text" },
		{ name: "distinctive_features", type: "list" },
		{ name: "tagline", type: "text" },
		{ name: "portrait", type: "text" },
		{ name: "significant_other", type: "list" },
		{ name: "family", type: "list" },
		{ name: "friends", type: "list" },
		{ name: "allies", type: "list" },
		{ name: "enemies", type: "list" },
		{ name: "first_appearance", type: "text" },
		{ name: "series", type: "text" },
		{ name: "tags", type: "tags" },
	],
	location: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "aliases", type: "list" },
		{ name: "world", type: "relation" },
		{ name: "locationType", type: "select", values: ["world", "realm", "area", "landmark", "building", "room"] },
		{ name: "region", type: "text" },
		{ name: "inhabitants", type: "list" },
		{ name: "first_appearance", type: "text" },
		{ name: "series", type: "text" },
		{ name: "image", type: "text" },
		{ name: "tags", type: "tags" },
	],
	object: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "aliases", type: "list" },
		{ name: "owner", type: "relation" },
		{ name: "kind", type: "select", values: ["contract", "artifact", "relic", "item"] },
		{ name: "first_appearance", type: "text" },
		{ name: "series", type: "text" },
		{ name: "image", type: "text" },
		{ name: "tags", type: "tags" },
	],
	lore: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "aliases", type: "list" },
		{ name: "scope", type: "select", values: ["world rule", "concept", "faction", "custom"] },
		{ name: "related", type: "list" },
		{ name: "first_appearance", type: "text" },
		{ name: "series", type: "text" },
		{ name: "tags", type: "tags" },
	],
	scene: [
		{ name: "type", type: "fixed" },
		{ name: "title", type: "text" },
		{ name: "subtitle", type: "text" },
		{ name: "book", type: "relation" },
		{ name: "act", type: "number" },
		{ name: "chapter", type: "text" },
		{ name: "order", type: "number" },
		{ name: "storyDay", type: "number" },
		{ name: "when", type: "text" },
		{ name: "status", type: "select", values: ["idea", "outline", "draft", "revised", "done", "final"] },
		{ name: "pov", type: "relation" },
		{ name: "characters", type: "list" },
		{ name: "location", type: "relation" },
		{ name: "plotlines", type: "list" },
		{ name: "arc", type: "text" },
		{ name: "beat", type: "text" },
		{ name: "wordcount", type: "number" },
		{ name: "prev", type: "list" },
		{ name: "next", type: "list" },
		{ name: "notes", type: "text" },
		{ name: "series", type: "text" },
		{ name: "tags", type: "tags" },
	],
	plotline: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "title", type: "text" },
		{ name: "logline", type: "text" },
		{ name: "status", type: "select", values: ["seed", "active", "resolved", "abandoned"] },
		{ name: "series", type: "text" },
		{ name: "tags", type: "tags" },
	],
	book: [
		{ name: "type", type: "fixed" },
		{ name: "name", type: "text" },
		{ name: "title", type: "text" },
		{ name: "subtitle", type: "text" },
		{ name: "author", type: "text" },
		{ name: "order", type: "number" },
		{ name: "status", type: "select", values: ["planning", "drafting", "revising", "done"] },
		{ name: "series", type: "text" },
		{ name: "tags", type: "tags" },
	],
};
