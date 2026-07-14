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
  - s-status
  - s-pov
  - s-chars
  - s-loc
  - s-plot
  - s-arc
  - s-beat
  - s-wc
  - s-day
  - s-flash
  - s-series
  - s-prev
  - s-next
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
    type: Input
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
  - name: status
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": idea
        "2": init
        "3": structure
        "4": draft
        "5": revise
        "6": done
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
    id: s-chars
  - name: location
    type: File
    options:
      dvQueryString: dv.pages("#canon/location")
    path: ""
    id: s-loc
  - name: plotlines
    type: Multi
    options:
      sourceType: ValuesList
      valuesList: {}
    path: ""
    id: s-plot
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
    id: s-wc
  - name: day
    type: Input
    options: {}
    path: ""
    id: s-day
  - name: flashback
    type: Boolean
    options: {}
    path: ""
    id: s-flash
  - name: series
    type: Input
    options: {}
    path: ""
    id: s-series
  - name: prev
    type: MultiFile
    options:
      dvQueryString: dv.pages("#manuscript/scene")
    path: ""
    id: s-prev
  - name: next
    type: MultiFile
    options:
      dvQueryString: dv.pages("#manuscript/scene")
    path: ""
    id: s-next
---
