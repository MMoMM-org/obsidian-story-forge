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
  - f-aliases
  - f-nickname
  - f-role
  - f-status
  - f-age
  - f-gender
  - f-occupation
  - f-height
  - f-build
  - f-hair
  - f-eyes
  - f-distinctive_features
  - f-tagline
  - f-portrait
  - f-significant_other
  - f-family
  - f-friends
  - f-allies
  - f-enemies
  - f-first_appearance
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
    id: f-aliases
  - name: nickname
    type: Input
    options: {}
    path: ""
    id: f-nickname
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
    id: f-occupation
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
    id: f-distinctive_features
  - name: tagline
    type: Input
    options: {}
    path: ""
    id: f-tagline
  - name: portrait
    type: Media
    options: {}
    path: ""
    id: f-portrait
  - name: significant_other
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-significant_other
  - name: family
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-family
  - name: friends
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-friends
  - name: allies
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-allies
  - name: enemies
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: f-enemies
  - name: first_appearance
    type: Input
    options: {}
    path: ""
    id: f-first_appearance
  - name: series
    type: Input
    options: {}
    path: ""
    id: f-series
---
