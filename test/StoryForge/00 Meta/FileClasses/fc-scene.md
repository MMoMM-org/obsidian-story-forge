---
limit: 20
mapWithTag: false
icon: clapperboard
tagNames:
  - manuscript/scene
filesPaths:
  - 10 Manuscript
bookmarksGroups:
excludes:
extends:
savedViews: []
favoriteView:
fieldsOrder:
  - s-type
  - s-title
  - s-subtitle
  - s-book
  - s-act
  - s-chapter
  - s-order
  - s-storyday
  - s-when
  - s-status
  - s-pov
  - s-characters
  - s-location
  - s-plotlines
  - s-arc
  - s-beat
  - s-wordcount
  - s-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": scene
    path: ""
    id: s-type
  - name: title
    type: Input
    options: {}
    path: ""
    id: s-title
  - name: subtitle
    type: Input
    options: {}
    path: ""
    id: s-subtitle
  - name: book
    type: File
    options:
      dvQueryString: dv.pages("#planning/book")
    path: ""
    id: s-book
  - name: act
    type: Number
    options: {}
    path: ""
    id: s-act
  - name: chapter
    type: Input
    options: {}
    path: ""
    id: s-chapter
  - name: order
    type: Number
    options: {}
    path: ""
    id: s-order
  - name: storyDay
    type: Number
    options: {}
    path: ""
    id: s-storyday
  - name: when
    type: Input
    options: {}
    path: ""
    id: s-when
  - name: status
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": idea
        "2": outline
        "3": draft
        "4": revised
        "5": done
        "6": final
    path: ""
    id: s-status
  - name: pov
    type: File
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: s-pov
  - name: characters
    type: MultiFile
    options:
      dvQueryString: dv.pages("#canon/character")
    path: ""
    id: s-characters
  - name: location
    type: File
    options:
      dvQueryString: dv.pages("#canon/location")
    path: ""
    id: s-location
  - name: plotlines
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: s-plotlines
  - name: arc
    type: Input
    options: {}
    path: ""
    id: s-arc
  - name: beat
    type: Input
    options: {}
    path: ""
    id: s-beat
  - name: wordcount
    type: Number
    options: {}
    path: ""
    id: s-wordcount
  - name: series
    type: Input
    options: {}
    path: ""
    id: s-series
---
