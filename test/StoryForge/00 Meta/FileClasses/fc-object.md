---
limit: 20
mapWithTag: false
icon: package
tagNames:
  - canon/object
filesPaths:
  - 30 Canon/33 Objects
bookmarksGroups: 
excludes: 
extends: 
savedViews: []
favoriteView: 
fieldsOrder:
  - o-type
  - o-name
  - o-alias
  - o-owner
  - o-kind
  - o-firstapp
  - o-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": object
    path: ""
    id: o-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: o-name
  - name: aliases
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: o-alias
  - name: owner
    type: File
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: o-owner
  - name: kind
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": contract
        "2": artifact
        "3": relic
        "4": item
    path: ""
    id: o-kind
  - name: first_appearance
    type: Input
    options: {}
    path: ""
    id: o-firstapp
  - name: series
    type: Input
    options: {}
    path: ""
    id: o-series
---
