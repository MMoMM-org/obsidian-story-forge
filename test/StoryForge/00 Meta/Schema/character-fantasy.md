# Character-fantasy — property reference

Extension fields for fantasy characters, added on top of the base `character.md` schema. Machine source: the `fc-character-fantasy` FileClass, which `extends: fc-character`. Apply this FileClass to characters that need species/combat/magic facts; otherwise the base character schema is enough.

## Properties

### `species`
Select — e.g. `Human | HighElf | DarkElf | WoodElf | Dwarf | Halfling | Orc | Ogre | Beastfolk | Catfolk | Merfolk | Fae | Pixie | Dragonkin | Demon | Undead | Mystical | Other`. The character's species/ancestry.

### `combat_skills`
List. Combat abilities, drawn from the value-list note `fc-combat-skills` in the FileClasses folder.

### `magical_abilities`
List. Magical abilities, drawn from the value-list note `fc-magical-abilities` in the FileClasses folder.

### `other_skills`
Text. Non-combat, non-magical skills worth tracking.

### `weapons`
List of text. Weapons the character characteristically carries.

### `armor`
List. Armour, drawn from the value-list note `fc-armor` in the FileClasses folder.

### `magical_items`
Text. Notable magical items carried (for canonical objects, prefer a `[[wikilink]]` to an object note).

### `other_equipment`
Text. Remaining notable gear.
