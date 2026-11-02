/**
 * kindFields — per-entity-kind field configuration.
 *
 * Returns the facts and relations field lists for each EntityKind.
 * Field names are canonical and verified against schema/*.json.
 *
 * This is the NATIVE FALLBACK config (CON-3): what the panel shows for a note
 * no FileClass applies to. When one does, the tile comes from its first
 * `Media`-typed field (`panel/tileField.ts`), and `image` below is not consulted.
 *
 * `image` names the field that draws the profile tile instead of a fact row:
 *   - character: `portrait`
 *   - location / object: `image`
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
	/** The native tile field (never listed in `facts`); absent for kinds with no tile. */
	image?: string;
}

/** Static per-kind field configuration. */
const KIND_FIELD_MAP: Record<EntityKind, KindFieldConfig> = {
	character: {
		image: "portrait",
		relations: ["significant_other", "family", "friends", "allies", "enemies"],
		facts: [
			"role", "status", "occupation", "age",
			"height", "build", "hair", "eyes",
			"distinctive_features", "aliases", "nickname",
			"tagline", "first_appearance",
		],
	},
	location: {
		image: "image",
		relations: ["world", "inhabitants"],
		facts: ["locationType", "region", "aliases", "first_appearance"],
	},
	object: {
		image: "image",
		relations: ["owner"],
		// `kind` is the object's category (contract/artifact/relic/item from schema/object.json),
		// NOT the EntityKind discriminant used by the plugin's classification layer.
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
