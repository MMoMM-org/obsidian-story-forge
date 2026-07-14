# Character-fantasy — property reference

Extension fields for fantasy characters, added on top of the base `character.md` schema. Machine source: `00 Meta/FileClasses/fc-character-fantasy.md`, which `extends: fc-character`. Apply this FileClass to characters that need species/combat/magic facts; otherwise the base character schema is enough.

## Properties

### `species`
Select — e.g. `Human | HighElf | DarkElf | WoodElf | Dwarf | Halfling | Orc | Ogre | Beastfolk | Catfolk | Merfolk | Fae | Pixie | Dragonkin | Demon | Undead | Mystical | Other`. The character's species/ancestry.

### `combat_skills`
List. Combat abilities, drawn from the value list in `00 Meta/FileClasses/fc-combat-skills.md`.

### `magical_abilities`
List. Magical abilities, drawn from `00 Meta/FileClasses/fc-magical-abilities.md`.

### `other_skills`
Text. Non-combat, non-magical skills worth tracking.

### `weapons`
List of text. Weapons the character characteristically carries.

### `armor`
List. Armour, drawn from `00 Meta/FileClasses/fc-armor.md`.

### `magical_items`
Text. Notable magical items carried (for canonical objects, prefer a `[[wikilink]]` to an object note under `30 Canon/33 Objects/`).

### `other_equipment`
Text. Remaining notable gear.
