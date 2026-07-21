---
limit: 20
mapWithTag: false
icon: book
tagNames:
  - planning/book
filesPaths:
  - 20 Planning
bookmarksGroups:
excludes:
extends:
savedViews: []
favoriteView:
fieldsOrder:
  - b-type
  - b-name
  - b-title
  - b-subtitle
  - b-author
  - b-order
  - b-status
  - b-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": book
    path: ""
    id: b-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: b-name
  - name: title
    type: Input
    options: {}
    path: ""
    id: b-title
  - name: subtitle
    type: Input
    options: {}
    path: ""
    id: b-subtitle
  - name: author
    type: Input
    options: {}
    path: ""
    id: b-author
  - name: order
    type: Number
    options: {}
    path: ""
    id: b-order
  - name: status
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": planning
        "2": drafting
        "3": revising
        "4": done
    path: ""
    id: b-status
  - name: series
    type: Input
    options: {}
    path: ""
    id: b-series
---
