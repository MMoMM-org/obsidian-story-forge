---
limit: 20
mapWithTag: false
icon: wand-sparkles
tagNames:
filesPaths:
bookmarksGroups:
excludes:
extends: fc-character
savedViews: []
favoriteView:
fieldsOrder:
  - g-species
  - g-combat_skills
  - g-magical_abilities
  - g-other_skills
  - g-weapons
  - g-armor
  - g-magical_items
  - g-other_equipment
version: "3.0"
fields:
  - name: species
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": Human
        "2": HighElf
        "3": DarkElf
        "4": WoodElf
        "5": Dwarf
        "6": Halfling
        "7": Orc
        "8": Ogre
        "9": Beastfolk
        "10": Catfolk
        "11": Merfolk
        "12": Fae
        "13": Pixie
        "14": Dragonkin
        "15": Demon
        "16": Undead
        "17": Mystical
        "18": Other
    path: ""
    id: g-species
  - name: combat_skills
    type: Multi
    options:
      sourceType: ValuesListNotePath
      valuesList: {}
      valuesListNotePath: 00 Meta/FileClasses/fc-combat-skills.md
    path: ""
    id: g-combat_skills
  - name: magical_abilities
    type: Multi
    options:
      sourceType: ValuesListNotePath
      valuesList: {}
      valuesListNotePath: 00 Meta/FileClasses/fc-magical-abilities.md
    path: ""
    id: g-magical_abilities
  - name: other_skills
    type: Input
    options: {}
    path: ""
    id: g-other_skills
  - name: weapons
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: g-weapons
  - name: armor
    type: Multi
    options:
      sourceType: ValuesListNotePath
      valuesList: {}
      valuesListNotePath: 00 Meta/FileClasses/fc-armor.md
    path: ""
    id: g-armor
  - name: magical_items
    type: Input
    options: {}
    path: ""
    id: g-magical_items
  - name: other_equipment
    type: Input
    options: {}
    path: ""
    id: g-other_equipment
---
