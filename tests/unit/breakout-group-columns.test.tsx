// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"
import { TablePreferencesProvider } from "@/components/tables/table-preferences-provider"
import { eventSurface } from "@/lib/breakouts/owner"
import { buildColumns, type BreakoutGroupRow } from "@/app/(event)/event/[id]/breakouts/breakout-group"

/**
 * The Breakout Groups table's column set.
 *
 * What this pins: the linked DGroup is not a column (it is set in the edit
 * drawer and read on the detail page — the list never surfaced it usefully),
 * and the group's matching profile is offered as opt-in columns whose unset
 * value reads "Any", the same word the detail card's `profileRows` uses.
 */

const { saveTablePreference, resetTablePreference } = vi.hoisted(() => ({
  saveTablePreference: vi.fn(async () => ({ success: true }) as const),
  resetTablePreference: vi.fn(async () => ({ success: true }) as const),
}))

vi.mock("@/lib/tables/actions", () => ({ saveTablePreference, resetTablePreference }))

beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function makeRow(overrides: Partial<BreakoutGroupRow> = {}): BreakoutGroupRow {
  return {
    id: "g1",
    name: "Table 1",
    facilitatorId: null,
    facilitator: null,
    coFacilitatorId: null,
    coFacilitator: null,
    memberLimit: 12,
    memberCount: 3,
    isEnabled: true,
    linkedSmallGroupId: "sg1",
    linkedSmallGroup: { id: "sg1", name: "Eastwood Young Pros" },
    lifeStages: [{ id: "ls1", name: "Young Pro" }],
    genderFocus: "Mixed",
    language: ["English", "Tagalog"],
    ageRangeMin: 25,
    ageRangeMax: 35,
    ...overrides,
  }
}

const columns = () =>
  buildColumns(eventSurface("e1"), () => {}, () => {}) as ColumnDef<BreakoutGroupRow>[]

function columnMeta(id: string) {
  const col = columns().find((c) => c.id === id || (c as { accessorKey?: string }).accessorKey === id)
  return col?.meta as { label?: string; optIn?: boolean } | undefined
}

describe("breakout groups columns", () => {
  it("does not offer the linked DGroup as a column", () => {
    const ids = columns().map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey)
    expect(ids).not.toContain("linkedSmallGroup")
  })

  it("offers every matching-profile factor, opt-in except life stage", () => {
    expect(columnMeta("lifeStage")).toMatchObject({ label: "Life Stage" })
    expect(columnMeta("lifeStage")?.optIn).toBeFalsy()
    expect(columnMeta("genderFocus")).toMatchObject({ label: "Gender Focus", optIn: true })
    expect(columnMeta("language")).toMatchObject({ label: "Language", optIn: true })
    expect(columnMeta("ageRange")).toMatchObject({ label: "Age Range", optIn: true })
  })

  it("keeps the profile columns out of the table until they are switched on", () => {
    render(
      <TablePreferencesProvider initial={{}}>
        <DataTable tableKey="event.breakout-members" columns={columns()} data={[makeRow()]} />
      </TablePreferencesProvider>,
    )
    expect(screen.getByRole("columnheader", { name: "Life Stage" })).toBeTruthy()
    expect(screen.queryByRole("columnheader", { name: "Gender Focus" })).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Language" })).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Age Range" })).toBeNull()
  })

  it("renders the profile once shown, and says 'Any' for an unset factor", () => {
    const shown = ["genderFocus", "language", "ageRange"]
    render(
      <TablePreferencesProvider
        initial={{
          "event.breakout-members": { hidden: [], shown, order: [], density: "Comfortable" },
        }}
      >
        <DataTable
          tableKey="event.breakout-members"
          columns={columns()}
          data={[
            makeRow(),
            makeRow({
              id: "g2",
              name: "Table 2",
              lifeStages: [],
              genderFocus: null,
              language: [],
              ageRangeMin: null,
              ageRangeMax: null,
            }),
          ]}
        />
      </TablePreferencesProvider>,
    )

    const rows = screen.getAllByRole("row")
    const set = within(rows[1])
    expect(set.getByText("Mixed")).toBeTruthy()
    expect(set.getByText("English, Tagalog")).toBeTruthy()
    expect(set.getByText("25–35 yrs")).toBeTruthy()

    // Unset is "matches everyone", never a dash.
    const unset = within(rows[2])
    expect(unset.getAllByText("Any")).toHaveLength(4)
    expect(unset.queryByText("—")).toBeNull()
  })
})
