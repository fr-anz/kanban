# Kanban Board — Design Document

## Aesthetic Stance

**Swiss minimalist.** The board is a work surface, not a product page. Every element earns its place. Generous whitespace, strict alignment, no decorative noise. Pastel column washes provide orientation without demanding attention.

---

## Typography

| Role | Family | Weight | Size |
|---|---|---|---|
| UI / body | Nunito | 400, 500, 600, 700 | 11–14px |
| Labels / deadlines | DM Mono | 400, 500 | 10–11px |

Nunito's geometric softness pairs with the pastel palette. DM Mono grounds data (deadlines, counts) in a structural register without feeling technical.

---

## Color System

### Ground
| Token | Value | Use |
|---|---|---|
| Board background | `#f5f4f2` | Page canvas |
| Card | `#ffffff` | Card surface |
| Border | `#e2ddd8` | Hairline rules, input borders |

### Columns (pastel washes)
Each column uses two tones — a lighter field and a slightly deeper header.

| Column | Field | Header |
|---|---|---|
| Lavender | `#e8e0f8` | `#c9b8f0` |
| Blue | `#d6eaff` | `#a8cff5` |
| Peach | `#fde8cf` | `#f5c897` |
| Mint | `#d4f5e2` | `#9fe4bf` |
| Rose | `#fce7f3` | `#f9a8d4` |
| Amber | `#fef3c7` | `#fcd34d` |

New columns cycle through this preset list in order.

### Tag palette (8 swatches)
Each tag gets a background + matching text color:

| Swatch | Background | Text |
|---|---|---|
| Lavender | `#e0d4f8` | `#6d4fc2` |
| Blue | `#cde6ff` | `#2563a8` |
| Peach | `#fde0d6` | `#b94a28` |
| Mint | `#d4f5e2` | `#1a7a4a` |
| Amber | `#fef3c7` | `#92400e` |
| Rose | `#fce7f3` | `#9d174d` |
| Sky | `#e0f2fe` | `#0369a1` |
| Stone | `#f3f4f6` | `#374151` |

### Priority dots
| Level | Color |
|---|---|
| High | `#f87171` (red) |
| Medium | `#f5c897` (orange) |
| Low | `#a8cff5` (blue) |

### Deadline status colors
| State | Color |
|---|---|
| Overdue | `#ef4444` |
| Due today / ≤ 3 days | `#f97316` |
| On track | `#6b7280` |

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header (sticky)                                             │
│  Board title + date        Tags button  Add column button   │
├─────────────────────────────────────────────────────────────┤
│ Board (horizontal scroll)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─ ─ ─ ─ ─ ┐  │
│  │ Column   │  │ Column   │  │ Column   │  │ + ghost   │  │
│  │ header   │  │ header   │  │ header   │  │           │  │
│  ├──────────┤  ├──────────┤  ├──────────┤  └─ ─ ─ ─ ─ ┘  │
│  │ Card     │  │ Card     │  │           │                  │
│  │ Card     │  │           │  │           │                  │
│  │ + Add    │  │ + Add    │  │ + Add    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

- Page uses `flex-col` root; board uses horizontal `flex` with `overflow-x-auto`
- Each column is `min-w-[260px] max-w-[300px] flex-1`
- Ghost column is fixed at `w-[260px]` with a dashed border
- Board padding: `px-8 py-6`
- Column gap: `gap-4`

---

## Components

### Header
- Left: board title (20px / 700) + current date (12px / 400, muted)
- Right: progress bar (when cards exist), Tags button, Add column button
- Background: `#f5f4f2`, bottom border: `#e2ddd8`

### Column header
- Rounded pill (`rounded-xl`) in the deeper pastel shade
- Column name: 11px / 700 / uppercase / wide tracking; accent color per column
- Card count: 12px / 600 / mono; same accent, 70% opacity
- Delete × revealed on column hover

### Card
- White surface, `rounded-xl`, hairline border, `shadow-sm`
- Hover: `shadow-md` (no layout shift)
- Top row: priority dot + tag pills
- Title: 14px / 700; strikethrough when column is "Done"
- Description: 12px / 400 / muted gray
- Footer: deadline badge (calendar icon + mono label)
- Delete × revealed on card hover, top-right

### Card modal
- Centered overlay, `backdrop-blur-[2px]`, white card `rounded-2xl`
- Fields: Title (text input), Description (textarea, 3 rows), Deadline (date input), Priority (dot toggle row), Tags (pill toggles)
- "Manage tags" link opens the tag manager
- Cancel + primary CTA

### Tag manager modal
- Same overlay treatment
- Scrollable list of existing tags with delete controls
- New tag form: name input + color swatch picker (8 circles) + Add tag button
- Cancel + Save

---

## Interaction Details

| Trigger | Behavior |
|---|---|
| Click column label | Inline rename (input replaces label) |
| Enter / blur on rename | Commits rename |
| Escape on rename | Reverts to previous label |
| Click card | Opens edit modal |
| Hover card | Reveals × delete button |
| Hover column header | Reveals × delete button |
| Click "Add card" | Opens new card modal for that column |
| Click "Add column" / ghost | Appends new column with next preset |
| Enter in card title field | Submits modal |
| Click modal backdrop | Closes modal |

---

## Scrollbar Treatment

Scrollbars are hidden at rest and revealed (6px, rounded thumb, `#d1ccc8`) only on hover. Applied globally via `::-webkit-scrollbar` rules.

---

## Accessibility Notes

- All interactive elements are `<button>` or `<input>` — keyboard focusable by default
- Priority dots carry `title` attributes for screen readers
- Color is never the sole signal for deadline urgency (text label accompanies every colored badge)
- Minimum target size for interactive controls: 24×24px
