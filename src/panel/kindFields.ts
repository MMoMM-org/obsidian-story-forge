/**
 * kindFields — per-entity-kind field configuration.
 *
 * Returns the facts and relations field lists for each EntityKind.
 * Field names are canonical and verified against schema/*.json.
 *
 * Special fields handled separately by renderers (not listed here):
 *   - character: `portrait`   (triggers portraitTile, not a factRow)
 *   - location:  `image`      (triggers imageTile, not a factRow)
 *   - object:    `image`      (triggers imageTile, not a factRow)
 *
 * @ref schema/character.json
 * @ref schema/location.json
 * @ref schema/object.json
 * @ref schema/lore.json
 * @ref schema/scene.json
 * @ref schema/plotline.json
 * @ref schema/book.json
 * @ref SDD/ADR-2 (per-kind renderers + shared config)
 */

import type { EntityKind } from "scoping/NoteContext";

export interface KindFieldConfig {
	/** Frontmatter fact fields, in display order. */
	facts: string[];
	/** Frontmatter relation fields (wikilink lists). */
	relations: string[];
}

/** Static per-kind field configuration. */
const KIND_FIELD_MAP: Record<EntityKind, KindFieldConfig> = {
	character: {
		relations: ["significant_other", "family", "friends", "allies", "enemies"],
		facts: [
			"role", "status", "occupation", "age",
			"height", "build", "hair", "eyes",
			"distinctive_features", "aliases", "nickname",
			"tagline", "first_appearance",
		],
	},
	location: {
		relations: ["world", "inhabitants"],
		facts: ["locationType", "region", "aliases", "first_appearance"],
	},
	object: {
		relations: ["owner"],
		facts: ["kind", "aliases", "first_appearance"],
	},
	lore: {
		relations: ["related"],
		facts: ["scope", "aliases", "first_appearance"],
	},
	scene: {
		relations: ["pov", "characters", "location", "plotlines", "book", "prev", "next"],
		facts: ["subtitle", "act", "chapter", "order", "when", "status", "arc"],
	},
	plotline: {
		relations: [],
		facts: ["logline", "status", "series"],
	},
	book: {
		relations: [],
		facts: ["subtitle", "author", "order", "status", "series"],
	},
	unknown: {
		relations: [],
		facts: [],
	},
};

/**
 * Return the field config for the given EntityKind.
 * Always returns a non-null object with facts and relations arrays.
 */
export function kindFields(kind: EntityKind): KindFieldConfig {
	return KIND_FIELD_MAP[kind];
}
