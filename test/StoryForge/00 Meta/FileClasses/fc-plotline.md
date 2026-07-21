---
limit: 20
mapWithTag: false
icon: git-branch
tagNames:
  - planning/plotline
filesPaths:
  - 20 Planning
bookmarksGroups:
excludes:
extends:
savedViews: []
favoriteView:
fieldsOrder:
  - p-type
  - p-name
  - p-title
  - p-logline
  - p-status
  - p-series
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": plotline
    path: ""
    id: p-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: p-name
  - name: title
    type: Input
    options: {}
    path: ""
    id: p-title
  - name: logline
    type: Input
    options: {}
    path: ""
    id: p-logline
  - name: status
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": seed
        "2": active
        "3": resolved
        "4": abandoned
    path: ""
    id: p-status
  - name: series
    type: Input
    options: {}
    path: ""
    id: p-series
---
