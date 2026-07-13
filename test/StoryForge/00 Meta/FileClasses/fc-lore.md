---
limit: 20
mapWithTag: false
icon: book-open
tagNames:
  - canon/lore
filesPaths:
  - 30 Canon/34 Lore
bookmarksGroups: 
excludes: 
extends: 
savedViews: []
favoriteView: 
fieldsOrder:
  - r-type
  - r-name
  - r-alias
  - r-scope
  - r-related
  - r-firstapp
  - r-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": lore
    path: ""
    id: r-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: r-name
  - name: aliases
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: r-alias
  - name: scope
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": world rule
        "2": concept
        "3": faction
        "4": custom
    path: ""
    id: r-scope
  - name: related
    type: MultiFile
    options:
      dvQueryString: dv.pages('"30 Canon"')
    path: ""
    id: r-related
  - name: first_appearance
    type: Input
    options: {}
    path: ""
    id: r-firstapp
  - name: series
    type: Input
    options: {}
    path: ""
    id: r-series
---
