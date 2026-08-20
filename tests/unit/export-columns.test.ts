import { describe, expect, it } from "vitest"
import {
  buildExportColumns,
  buildExportTable,
  defaultSelectedColumns,
  formatManilaDateTime,
  isCoreColumn,
  sortByGroup,
  yesNo,
  type ExportColumnDef,
} from "@/lib/exports/columns"

/**
 * The generic column model every picker export is built on. The per-surface
 * registries (cluster / event registrations, session attendance, volunteers)
 * have their own suites; this one pins the rules they all inherit.
 */

type Row = {
  name: string
  answer: string | null
  flag: boolean
}

const GROUPS = ["First", "Second"] as const
type Group = (typeof GROUPS)[number]

const core: ExportColumnDef<Row, Group> = {
  key: "name",
  label: "Name",
  group: "First",
  toggle: null,
  value: (r) => r.name,
}
const gated: ExportColumnDef<Row, Group> = {
  key: "answer",
  label: "Answer",
  group: "First",
  toggle: "fieldNickname",
  value: (r) => r.answer,
}
const moduleGated: ExportColumnDef<Row, Group> = {
  key: "flag",
  label: "Flag",
  group: "Second",
  toggle: null,
  module: "Baptism",
  hasData: (rows) => rows.some((r) => r.flag),
  value: (r) => yesNo(r.flag),
}
const optional: ExportColumnDef<Row, Group> = {
  key: "optional",
  label: "Optional",
  group: "Second",
  toggle: null,
  optional: true,
  value: (r) => r.answer,
}

const row = (overrides: Partial<Row> = {}): Row => ({
  name: "Juan",
  answer: null,
  flag: false,
  ...overrides,
})

describe("isCoreColumn", () => {
  it("is true only when nothing gates the column", () => {
    expect(isCoreColumn(core)).toBe(true)
    expect(isCoreColumn(gated)).toBe(false)
    expect(isCoreColumn(moduleGated)).toBe(false)
    expect(isCoreColumn(optional)).toBe(false)
  })
})

describe("buildExportColumns", () => {
  const never = () => false
  const always = () => true

  it("offers core columns even when every row is blank", () => {
    const columns = buildExportColumns([core], [row({ name: "" })], never)
    expect(columns).toEqual([
      { key: "name", label: "Name", group: "First", core: true, collected: true, hasData: false },
    ])
  })

  it("offers a still-gathered column that nobody has answered", () => {
    const [column] = buildExportColumns([gated], [row()], always)
    expect(column).toMatchObject({ key: "answer", core: false, collected: true, hasData: false })
  })

  it("keeps a column that is no longer gathered but holds answers", () => {
    const [column] = buildExportColumns([gated], [row({ answer: "JD" })], never)
    expect(column).toMatchObject({ key: "answer", core: false, collected: false, hasData: true })
  })

  it("drops a column that is neither gathered nor populated", () => {
    expect(buildExportColumns([gated], [row()], never)).toEqual([])
  })

  it("uses the hasData override instead of the emptiness test", () => {
    // "No" is a value, so the default test would call this populated. The
    // override is what keeps a Yes/No column off a surface that never uses it.
    const off = buildExportColumns([moduleGated], [row({ flag: false })], never)
    expect(off).toEqual([])

    const on = buildExportColumns([moduleGated], [row({ flag: true })], never)
    expect(on[0]).toMatchObject({ key: "flag", collected: false, hasData: true })
  })

  it("consults isGathered per column, so a module gate can differ from a toggle", () => {
    const columns = buildExportColumns(
      [gated, moduleGated],
      [row()],
      (column) => column.module === "Baptism",
    )
    expect(columns.map((c) => c.key)).toEqual(["flag"])
    expect(columns[0]).toMatchObject({ collected: true, hasData: false })
  })

  it("offers an optional column only when populated, and never flags it", () => {
    expect(buildExportColumns([optional], [row()], never)).toEqual([])

    const [column] = buildExportColumns([optional], [row({ answer: "x" })], never)
    // Reported core so the picker shows no "No longer asked" badge — nobody was
    // ever asked for it, so saying the question was switched off would be a lie.
    expect(column).toMatchObject({ key: "optional", core: true, collected: true, hasData: true })
  })

  it("treats whitespace as empty", () => {
    expect(buildExportColumns([gated], [row({ answer: "   " })], never)).toEqual([])
  })
})

describe("defaultSelectedColumns", () => {
  it("returns every offered key", () => {
    const columns = buildExportColumns([core, gated], [row({ answer: "JD" })], () => true)
    expect(defaultSelectedColumns(columns)).toEqual(["name", "answer"])
  })
})

describe("sortByGroup", () => {
  it("orders by group and keeps the declared order within one", () => {
    const sorted = sortByGroup([moduleGated, core, gated], GROUPS)
    expect(sorted.map((c) => c.key)).toEqual(["name", "answer", "flag"])
  })
})

describe("buildExportTable", () => {
  const columns = [core, gated, moduleGated]

  it("renders only the selected columns", () => {
    const { headers, cells } = buildExportTable(columns, [row({ answer: "JD" })], [
      "name",
      "answer",
    ])
    expect(headers).toEqual(["Name", "Answer"])
    expect(cells).toEqual([["Juan", "JD"]])
  })

  it("follows the registry order, not the order the keys were ticked in", () => {
    const { headers } = buildExportTable(columns, [row()], ["flag", "name"])
    expect(headers).toEqual(["Name", "Flag"])
  })

  it("ignores unknown keys", () => {
    const { headers } = buildExportTable(columns, [row()], ["name", "not-a-column"])
    expect(headers).toEqual(["Name"])
  })

  it("returns headers only when there are no rows", () => {
    const { headers, cells } = buildExportTable(columns, [], ["name"])
    expect(headers).toEqual(["Name"])
    expect(cells).toEqual([])
  })
})

describe("formatManilaDateTime", () => {
  it("renders yyyy-mm-dd hh:mm in Manila so a spreadsheet sorts it", () => {
    // 2026-03-01T01:30Z is 09:30 on the 1st in Manila (UTC+8).
    const formatted = formatManilaDateTime("2026-03-01T01:30:00.000Z")
    expect(formatted.startsWith("2026-03-01")).toBe(true)
    expect(formatted.toLowerCase()).toContain("9:30")
  })

  it("rolls into the next Manila day for a late-UTC instant", () => {
    expect(formatManilaDateTime("2026-03-01T17:00:00.000Z").startsWith("2026-03-02")).toBe(true)
  })

  it("renders null as an empty cell", () => {
    expect(formatManilaDateTime(null)).toBe("")
  })
})
