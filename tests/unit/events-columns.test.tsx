// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"

import { DataTable } from "@/components/ui/data-table"
import { TablePreferencesProvider } from "@/components/tables/table-preferences-provider"
import { buildColumns, type EventRow } from "@/app/(dashboard)/events/columns"

/**
 * The Events list's column set.
 *
 * What this pins: the event's type is a shown column (the list already filters
 * on it, and it is what tells a reader whether the Date cell is one day or a
 * range), rendered in the same words the create/edit form offers — "One-time",
 * not the enum's `OneTime`.
 */

const { saveTablePreference, resetTablePreference } = vi.hoisted(() => ({
  saveTablePreference: vi.fn(async () => ({ success: true }) as const),
  resetTablePreference: vi.fn(async () => ({ success: true }) as const),
}))

vi.mock("@/lib/tables/actions", () => ({ saveTablePreference, resetTablePreference }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function makeRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "e1",
    name: "Victory Weekend",
    ministries: [],
    allMinistries: false,
    startDate: "2026-08-20T00:00:00.000Z",
    endDate: "2026-08-20T00:00:00.000Z",
    price: null,
    registrationStart: null,
    registrationEnd: null,
    registrantCount: 0,
    description: null,
    type: "OneTime",
    recurrenceDayOfWeek: null,
    recurrenceFrequency: null,
    recurrenceEndDate: null,
    ...overrides,
  }
}

const columnIds = () =>
  buildColumns().map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey)

describe("events columns", () => {
  it("offers Type as a shown column, not an opt-in one", () => {
    const col = buildColumns().find((c) => (c as { accessorKey?: string }).accessorKey === "type")
    expect(col?.meta).toMatchObject({ label: "Type", width: "status" })
    expect((col?.meta as { optIn?: boolean } | undefined)?.optIn).toBeFalsy()
  })

  it("puts Type beside the Date it qualifies", () => {
    const ids = columnIds()
    expect(ids.indexOf("date")).toBe(ids.indexOf("type") + 1)
  })

  it("renders each type in the words the event form uses", () => {
    render(
      <TablePreferencesProvider initial={{}}>
        <DataTable
          tableKey="events"
          columns={buildColumns()}
          data={[
            makeRow({ type: "OneTime" }),
            makeRow({ id: "e2", type: "MultiDay" }),
            makeRow({ id: "e3", type: "Recurring" }),
          ]}
        />
      </TablePreferencesProvider>,
    )

    expect(screen.getByRole("columnheader", { name: "Type" })).toBeTruthy()
    const rows = screen.getAllByRole("row")
    expect(within(rows[1]).getByText("One-time")).toBeTruthy()
    expect(within(rows[2]).getByText("Multi-day")).toBeTruthy()
    expect(within(rows[3]).getByText("Recurring")).toBeTruthy()
  })
})
