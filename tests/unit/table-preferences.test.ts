import { describe, expect, it } from "vitest"

import {
  COLUMN_WIDTHS,
  columnStyles,
  columnWidth,
  tableMinWidth,
} from "@/lib/tables/column-sizing"
import {
  changedColumnCount,
  isDefaultLayout,
  resolveTableColumns,
  toggleColumn,
  type TableColumnSpec,
  type TablePreference,
  DEFAULT_TABLE_PREFERENCE,
} from "@/lib/tables/preferences"

/**
 * The saved-layout merge is the one piece of this feature that can silently
 * corrupt what an admin sees: a stale preference must never hide a column that
 * was added after it was saved, and must never resurrect one that was removed.
 */

// A stand-in for the Members registry: locked bookends, movable middle.
const specs: TableColumnSpec[] = [
  { id: "select", label: "Select", locked: true, optIn: false },
  { id: "name", label: "Name", locked: true, optIn: false },
  { id: "email", label: "Email", locked: false, optIn: false },
  { id: "phone", label: "Mobile", locked: false, optIn: false },
  { id: "lifeStage", label: "Life Stage", locked: false, optIn: false },
  { id: "gender", label: "Gender", locked: false, optIn: true },
  { id: "actions", label: "Actions", locked: true, optIn: false },
]

const ids = (layout: { columns: { id: string }[] }) => layout.columns.map((c) => c.id)
const visibleIds = (layout: { columns: { id: string; visible: boolean }[] }) =>
  layout.columns.filter((c) => c.visible).map((c) => c.id)

describe("resolveTableColumns — defaults", () => {
  it("shows every ordinary column and hides every opt-in column", () => {
    const layout = resolveTableColumns(specs, null)
    expect(visibleIds(layout)).toEqual([
      "select",
      "name",
      "email",
      "phone",
      "lifeStage",
      "actions",
    ])
    expect(layout.density).toBe("Comfortable")
  })

  it("keeps the registry order when nothing is saved", () => {
    expect(ids(resolveTableColumns(specs, null))).toEqual(specs.map((s) => s.id))
  })

  it("counts only hideable columns as hideable", () => {
    // select, name and actions are locked; email, phone, lifeStage, gender are not.
    expect(resolveTableColumns(specs, null).hideableCount).toBe(4)
  })
})

describe("resolveTableColumns — visibility", () => {
  it("hides a column named in `hidden`", () => {
    const layout = resolveTableColumns(specs, { hidden: ["email"] })
    expect(visibleIds(layout)).not.toContain("email")
    expect(ids(layout)).toContain("email") // still offered in the picker
  })

  it("shows an opt-in column named in `shown`", () => {
    const layout = resolveTableColumns(specs, { shown: ["gender"] })
    expect(visibleIds(layout)).toContain("gender")
  })

  it("ignores `hidden` for a locked column", () => {
    // Honouring this would strand every row with no link to its detail page.
    const layout = resolveTableColumns(specs, { hidden: ["name", "select", "actions"] })
    expect(visibleIds(layout)).toEqual(expect.arrayContaining(["name", "select", "actions"]))
  })

  it("shows a column added after the preference was saved", () => {
    // The regression this whole storage shape exists to prevent.
    const saved: TablePreference = {
      hidden: ["email"],
      shown: [],
      order: ["email", "phone"],
      density: "Comfortable",
    }
    const withNewColumn: TableColumnSpec[] = [
      ...specs.slice(0, 5),
      { id: "workCity", label: "Work City", locked: false, optIn: false },
      ...specs.slice(5),
    ]
    expect(visibleIds(resolveTableColumns(withNewColumn, saved))).toContain("workCity")
  })

  it("keeps an opt-in column added after the preference was saved switched off", () => {
    const saved: TablePreference = {
      hidden: [],
      shown: ["gender"],
      order: [],
      density: "Comfortable",
    }
    const withNewOptIn: TableColumnSpec[] = [
      ...specs,
      { id: "notes", label: "Notes", locked: false, optIn: true },
    ]
    const layout = resolveTableColumns(withNewOptIn, saved)
    expect(visibleIds(layout)).toContain("gender")
    expect(visibleIds(layout)).not.toContain("notes")
  })

  it("ignores a saved id for a column that no longer exists", () => {
    const layout = resolveTableColumns(specs, {
      hidden: ["retiredColumn"],
      order: ["retiredColumn", "phone", "email"],
    })
    expect(ids(layout)).not.toContain("retiredColumn")
    // The saved order knew only phone and email; lifeStage and gender were
    // declared after phone, so they slot in behind it rather than appending.
    expect(ids(layout)).toEqual([
      "select",
      "name",
      "phone",
      "lifeStage",
      "gender",
      "email",
      "actions",
    ])
  })
})

describe("resolveTableColumns — order", () => {
  it("applies a saved order to the movable columns", () => {
    const layout = resolveTableColumns(specs, { order: ["lifeStage", "phone", "email", "gender"] })
    expect(ids(layout)).toEqual([
      "select",
      "name",
      "lifeStage",
      "phone",
      "email",
      "gender",
      "actions",
    ])
  })

  it("pins locked columns to their registry slots whatever the saved order says", () => {
    const layout = resolveTableColumns(specs, {
      order: ["actions", "name", "phone", "select", "email", "lifeStage", "gender"],
    })
    expect(ids(layout)[0]).toBe("select")
    expect(ids(layout)[1]).toBe("name")
    expect(ids(layout).at(-1)).toBe("actions")
  })

  it("slots a new column in beside the column it was declared after", () => {
    const saved = { order: ["lifeStage", "email", "phone", "gender"] }
    const withNewColumn: TableColumnSpec[] = [
      ...specs.slice(0, 3), // select, name, email
      { id: "nickname", label: "Nickname", locked: false, optIn: false },
      ...specs.slice(3),
    ]
    // Declared right after `email`, so it lands right after `email` — not at
    // the far right, and not back at its registry index.
    expect(ids(resolveTableColumns(withNewColumn, saved))).toEqual([
      "select",
      "name",
      "lifeStage",
      "email",
      "nickname",
      "phone",
      "gender",
      "actions",
    ])
  })

  it("returns one entry per column, with no duplicates, given a duplicated saved order", () => {
    const layout = resolveTableColumns(specs, { order: ["email", "email", "phone"] })
    expect(ids(layout)).toHaveLength(specs.length)
    expect(new Set(ids(layout)).size).toBe(specs.length)
  })
})

describe("toggleColumn", () => {
  it("adds an ordinary column to `hidden` when switched off", () => {
    const next = toggleColumn(specs[2], false, DEFAULT_TABLE_PREFERENCE)
    expect(next.hidden).toEqual(["email"])
    expect(next.shown).toEqual([])
  })

  it("removes an ordinary column from `hidden` when switched back on", () => {
    const next = toggleColumn(specs[2], true, { ...DEFAULT_TABLE_PREFERENCE, hidden: ["email"] })
    expect(next.hidden).toEqual([])
  })

  it("adds an opt-in column to `shown`, never removes it from `hidden`", () => {
    const next = toggleColumn(specs[5], true, DEFAULT_TABLE_PREFERENCE)
    expect(next.shown).toEqual(["gender"])
    expect(next.hidden).toEqual([])
  })

  it("refuses to change a locked column", () => {
    expect(toggleColumn(specs[1], false, DEFAULT_TABLE_PREFERENCE)).toEqual(
      DEFAULT_TABLE_PREFERENCE,
    )
  })

  it("does not double-add on a repeated toggle", () => {
    let pref = toggleColumn(specs[2], false, DEFAULT_TABLE_PREFERENCE)
    pref = toggleColumn(specs[2], false, pref)
    expect(pref.hidden).toEqual(["email"])
  })
})

describe("isDefaultLayout / changedColumnCount", () => {
  it("treats an empty preference as default", () => {
    expect(isDefaultLayout(specs, null)).toBe(true)
    expect(changedColumnCount(specs, null)).toBe(0)
  })

  it("treats a saved order matching the registry as default", () => {
    expect(isDefaultLayout(specs, { order: ["email", "phone", "lifeStage", "gender"] })).toBe(true)
  })

  it("notices a hidden column, a shown opt-in, a reorder and a density change", () => {
    expect(isDefaultLayout(specs, { hidden: ["email"] })).toBe(false)
    expect(isDefaultLayout(specs, { shown: ["gender"] })).toBe(false)
    expect(isDefaultLayout(specs, { order: ["phone", "email", "lifeStage", "gender"] })).toBe(false)
    expect(isDefaultLayout(specs, { density: "Compact" })).toBe(false)
  })

  it("does not count stale ids for columns that no longer exist", () => {
    expect(isDefaultLayout(specs, { hidden: ["retiredColumn"] })).toBe(true)
    expect(changedColumnCount(specs, { hidden: ["retiredColumn"], shown: ["alsoGone"] })).toBe(0)
  })

  it("counts each switched column once", () => {
    expect(changedColumnCount(specs, { hidden: ["email", "phone"], shown: ["gender"] })).toBe(3)
  })
})

describe("column width vocabulary", () => {
  it("keeps min <= size for every token", () => {
    for (const [token, width] of Object.entries(COLUMN_WIDTHS)) {
      expect(width.min, `${token}.min <= size`).toBeLessThanOrEqual(width.size)
    }
  })

  it("gives every flexible column a proportional width and a pixel floor", () => {
    const styles = columnStyles(["micro", "name", "email"])
    // The checkbox never flexes.
    expect(styles[0].width).toBe("44px")
    // The rest split what's left, and never drop below their floor.
    expect(styles[1].width).toContain("140px")
    expect(styles[1].width).toContain("calc((100% - 44px)")
    expect(styles[2].width).toContain("150px")
  })

  it("gives the same token the same width wherever it appears", () => {
    const [a, b] = columnStyles(["phone", "phone"])
    expect(a.width).toBe(b.width)
  })

  it("falls back to the text token for a column that names no width", () => {
    expect(columnWidth(undefined)).toEqual(COLUMN_WIDTHS.text)
  })

  it("sums the minimums so the container scrolls rather than crushing columns", () => {
    expect(tableMinWidth(["micro", "name", "email"])).toBe(
      COLUMN_WIDTHS.micro.min + COLUMN_WIDTHS.name.min + COLUMN_WIDTHS.email.min,
    )
  })

  it("gives the row-actions column room for its 32px trigger plus a gutter", () => {
    // The bug this token exists for: on `micro` (44px) the "⋯" button had a
    // 12px content box after the cell's px-4, so it overflowed its own cell,
    // was clipped by `truncate`, and lost the right edge of its hit area.
    // 52px less the 8px inset leaves 36px — the button fits with slack.
    expect(COLUMN_WIDTHS.actions.size - 16).toBeGreaterThanOrEqual(32)
    expect(COLUMN_WIDTHS.actions.min).toBe(COLUMN_WIDTHS.actions.size)

    const styles = columnStyles(["name", "actions"])
    expect(styles[1].width).toBe("52px")
    // Fixed, so it comes out of the flexible columns' budget rather than
    // flexing itself.
    expect(styles[0].width).toContain("calc((100% - 52px)")
    expect(tableMinWidth(["name", "actions"])).toBe(
      COLUMN_WIDTHS.name.min + COLUMN_WIDTHS.actions.min,
    )
  })
})
