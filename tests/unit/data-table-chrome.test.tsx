// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { render, within } from "@testing-library/react"
import { type ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"
import { TablePreferencesProvider } from "@/components/tables/table-preferences-provider"

/**
 * The table's own chrome: the toolbar strip and the trailing "⋯" cell.
 *
 * What these pin, both of which were visible on every list screen in the app:
 *
 * 1. The strip used to be `justify-end` with only the Columns picker in it, so
 *    its left half was permanently empty. It now states how many rows are on
 *    screen, in the list's own noun.
 * 2. The actions column sat on the 44px `micro` token while carrying a 32px
 *    icon button and the shared `px-4`, which left a 12px content box — the
 *    button overflowed its cell, `truncate` clipped it, and the glyph ended up
 *    jammed against the card border with part of its hit area gone.
 */

vi.mock("@/lib/tables/actions", () => ({
  saveTablePreference: vi.fn(async () => ({ success: true }) as const),
  resetTablePreference: vi.fn(async () => ({ success: true }) as const),
}))

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

type Row = { id: string; name: string; children?: Row[] }

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { label: "Name", width: "name", locked: true },
    cell: ({ row }) => row.original.name,
  },
  {
    id: "actions",
    meta: { width: "actions", locked: true },
    cell: () => (
      <button type="button" className="size-8">
        ⋯
      </button>
    ),
  },
]

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row, unknown>>> = {}) {
  const data: Row[] = props.data ?? [
    { id: "1", name: "Ana Reyes" },
    { id: "2", name: "Ben Cruz" },
    { id: "3", name: "Cara Lim" },
  ]
  return render(
    <TablePreferencesProvider initial={{}}>
      <DataTable tableKey="test.people" columns={columns} {...props} data={data} />
    </TablePreferencesProvider>,
  )
}

/** The strip above the header row — the one holding the Columns button. */
function toolbar(container: HTMLElement): HTMLElement {
  const strip = container.querySelector("div.border-b")
  if (!strip) throw new Error("toolbar strip not rendered")
  return strip as HTMLElement
}

describe("DataTable toolbar", () => {
  it("states the row count on the left, in the list's own noun", () => {
    const { container } = renderTable({
      rowLabel: { one: "event", many: "events" },
    })
    const strip = toolbar(container)

    expect(strip.textContent).toContain("3 events")
    // …and the picker is still its right-hand occupant.
    expect(within(strip).getByRole("button", { name: /columns/i })).toBeTruthy()
  })

  it("falls back to rows for a screen that names no noun", () => {
    const { container } = renderTable()
    expect(toolbar(container).textContent).toContain("3 rows")
  })

  it("uses the singular for one row and still speaks for an empty list", () => {
    const one = renderTable({
      data: [{ id: "1", name: "Ana Reyes" }],
      rowLabel: { one: "guest", many: "guests" },
    })
    expect(toolbar(one.container).textContent).toContain("1 guest")

    const none = renderTable({ data: [], rowLabel: { one: "guest", many: "guests" } })
    expect(toolbar(none.container).textContent).toContain("0 guests")
  })

  it("counts the rows on screen, not the sub-rows nested under them", () => {
    // A tree table describes three people, not three people plus their children.
    const { container } = renderTable({
      data: [
        { id: "1", name: "Ana Reyes", children: [{ id: "1a", name: "Child A" }] },
        { id: "2", name: "Ben Cruz", children: [{ id: "2a", name: "Child B" }] },
      ],
      getSubRows: (row: Row) => row.children,
      rowLabel: { one: "family", many: "families" },
    })
    expect(toolbar(container).textContent).toContain("2 families")
  })
})

describe("row-actions column", () => {
  it("is 52px wide, not the 44px the checkbox column uses", () => {
    const { container } = renderTable()
    const widths = Array.from(container.querySelectorAll("colgroup col")).map(
      (c) => (c as HTMLElement).style.width,
    )
    expect(widths[1]).toBe("52px")
  })

  it("swaps the shared px-4 for a tight inset so the trigger clears the edge", () => {
    const { container } = renderTable()
    const cell = container.querySelector("tbody tr td:last-child") as HTMLElement

    // 52 − 2×8 = 36px of content box for a 32px button: it fits, so nothing
    // overflows for `truncate` to clip.
    expect(cell.className).toContain("px-2")
    expect(cell.className).toContain("text-right")
    // The shorthand must be *gone*, not merely followed by a one-sided
    // override — otherwise which padding wins is down to stylesheet order.
    expect(cell.className).not.toContain("px-4")
  })

  it("gives the header cell the same inset, so the column lines up", () => {
    const { container } = renderTable()
    const head = container.querySelector("thead th:last-child") as HTMLElement
    expect(head.className).toContain("px-2")
    expect(head.className).not.toContain("px-4")
  })
})
