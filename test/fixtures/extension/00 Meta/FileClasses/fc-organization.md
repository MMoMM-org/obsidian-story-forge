---
title: Organization profile
limit: 20
mapWithTag: false
icon: users
tagNames:
  - canon/organization
filesPaths:
bookmarksGroups:
excludes:
extends:
savedViews: []
favoriteView:
fieldsOrder:
  - org-type
  - org-name
  - org-standing
  - org-founded
  - org-motto
version: "3.0"
fields:
  - name: type
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": organization
    path: ""
    id: org-type
  - name: name
    type: Input
    options: {}
    path: ""
    id: org-name
  - name: standing
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": rising
        "2": dominant
        "3": waning
        "4": outlawed
    path: ""
    id: org-standing
  - name: founded
    type: Number
    options: {}
    path: ""
    id: org-founded
  - name: motto
    type: Input
    options: {}
    path: ""
    id: org-motto
---

A FileClass written by hand for the T8.1 extension test: a kind Story Forge does not ship
(an isekai world's guilds and orders), declared in metadata-menu's format.
