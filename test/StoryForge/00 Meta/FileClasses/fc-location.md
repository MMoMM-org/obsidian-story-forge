---
limit: 20
mapWithTag: false
icon: map-pin
tagNames:
  - canon/location
filesPaths:
  - 30 Canon/32 Locations
bookmarksGroups: 
excludes: 
extends: 
savedViews: []
favoriteView: 
fieldsOrder:
  - l-type
  - l-name
  - l-alias
  - l-world
  - l-loctype
  - l-region
  - l-inhab
  - l-firstapp
  - l-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": location
    path: ""
    id: l-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: l-name
  - name: aliases
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: l-alias
  - name: world
    type: File
    options:
      dvQueryString: dv.pages("#canon/location")
    path: ""
    id: l-world
  - name: locationType
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": world
        "2": realm
        "3": area
        "4": landmark
        "5": building
        "6": room
    path: ""
    id: l-loctype
  - name: region
    type: Input
    options: {}
    path: ""
    id: l-region
  - name: inhabitants
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: l-inhab
  - name: first_appearance
    type: Input
    options: {}
    path: ""
    id: l-firstapp
  - name: series
    type: Input
    options: {}
    path: ""
    id: l-series
---
