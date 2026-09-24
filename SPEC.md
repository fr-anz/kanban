# Kanban Board — Product Spec

## Overview

A personal, single-user kanban board for the web. No accounts, no collaboration, no sync — just a fast, local task board for one person to organize work across custom columns with deadlines.

---

## Core Concepts

### Board
One board per session. The board holds an ordered list of columns.

### Column
A vertical lane representing a stage of work (e.g. To Do, In Progress, Done). Columns are user-defined: they can be created, renamed, and deleted at any time. The board starts with three default columns.

### Card
A task living inside a column. A card has:
- **Title** (required)
- **Description** (optional, freeform text)
- **Deadline** (optional, ISO date)
- **Priority** (low / medium / high)
- **Tags** (zero or more, user-defined)

### Tag
A label with a name and a pastel color. Tags are global — defined once and applied to any card. Users manage tags from a dedicated modal reachable from the header or the card editor.

---

## Features

### Column management
- Create a column via the header button or the ghost column at the end of the board
- Rename a column by clicking its title inline
- Delete a column (hover to reveal the delete control)
- Columns cycle through a set of pastel color presets

### Card management
- Add a card via the "Add card" button at the bottom of any column
- Edit a card by clicking it — opens the same modal pre-filled
- Delete a card via the hover-revealed × control on the card
- Cards in a column named "Done" (case-insensitive) render with strikethrough and reduced opacity

### Tag management
- Open the tag manager from the header "Tags" button or the "Manage tags" link inside the card modal
- Create a tag: enter a name, pick a pastel swatch, press Add tag or Enter
- Delete a tag from the manager list
- Tags removed from the manager disappear from all cards automatically (filtered at render time)

### Deadline display
Deadlines are shown on cards with a calendar icon and a human-readable status:
- Overdue → red, "Nd overdue"
- Due today → orange, "Due today"
- Due within 3 days → orange, "Nd left"
- On track → gray, formatted date (e.g. "Oct 12")
- No deadline → nothing shown

### Progress indicator
When the board has at least one card, the header shows a "X / Y done" counter and a thin progress bar. The "done" count comes from the column whose label matches "done" (case-insensitive).

---
