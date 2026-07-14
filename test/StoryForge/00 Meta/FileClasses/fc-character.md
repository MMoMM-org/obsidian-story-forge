---
limit: 20
mapWithTag: false
icon: user
tagNames:
  - canon/character
filesPaths:
  - 30 Canon/31 Characters
bookmarksGroups: 
excludes: 
extends: 
savedViews: []
favoriteView: 
fieldsOrder:
  - f-type
  - f-name
  - f-alias
  - f-nick
  - f-role
  - f-status
  - f-age
  - f-gender
  - f-occ
  - f-height
  - f-build
  - f-hair
  - f-eyes
  - f-distf
  - f-tagl
  - f-portr
  - f-so
  - f-fam
  - f-frnd
  - f-ally
  - f-enmy
  - f-firstapp
  - f-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": character
    path: ""
    id: f-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: f-name
  - name: aliases
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: f-alias
  - name: nickname
    type: Input
    options: {}
    path: ""
    id: f-nick
  - name: role
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": protagonist
        "2": deuteragonist
        "3": antagonist
        "4": supporting
        "5": minor
    path: ""
    id: f-role
  - name: status
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": alive
        "2": dead
        "3": missing
        "4": unknown
    path: ""
    id: f-status
  - name: age
    type: Number
    options: {}
    path: ""
    id: f-age
  - name: gender
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": male
        "2": female
        "3": diverse
        "4": nonbinary
    path: ""
    id: f-gender
  - name: occupation
    type: Input
    options: {}
    path: ""
    id: f-occ
  - name: height
    type: Number
    options: {}
    path: ""
    id: f-height
  - name: build
    type: Input
    options: {}
    path: ""
    id: f-build
  - name: hair
    type: Input
    options: {}
    path: ""
    id: f-hair
  - name: eyes
    type: Input
    options: {}
    path: ""
    id: f-eyes
  - name: distinctive_features
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: f-distf
  - name: tagline
    type: Input
    options: {}
    path: ""
    id: f-tagl
  - name: portrait
    type: Input
    options: {}
    path: ""
    id: f-portr
  - name: significant_other
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-so
  - name: family
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-fam
  - name: friends
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-frnd
  - name: allies
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-ally
  - name: enemies
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-enmy
  - name: first_appearance
    type: Input
    options: {}
    path: ""
    id: f-firstapp
  - name: series
    type: Input
    options: {}
    path: ""
    id: f-series
---
