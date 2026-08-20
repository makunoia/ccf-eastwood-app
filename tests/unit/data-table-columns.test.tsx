// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { type ColumnDef } from "@tanstack/react-table"

import { COLUMN_WIDTHS } from "@/lib/tables/column-sizing"
import { DataTable } from "@/components/ui/data-table"
import { TablePreferencesProvider } from "@/components/tables/table-preferences-provider"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"

/**
 * The column picker and the copyable contact cells, through the real DataTable.
 *
 * What these pin: a locked column can never be switched off (hiding the
 * identifier would leave rows with no way into their detail page), a hidden
 * column leaves the DOM rather than merely being styled away, an opt-in column
 * starts off, and the clipboard always receives the *full* value — not the
 * truncated string the column had room to draw.
 */

const { saveTablePreference, resetTablePreference } = vi.hoisted(() => ({
  saveTablePreference: vi.fn(async () => ({ success: true }) as const),
  resetTablePreference: vi.fn(async () => ({ success: true }) as const),
}))

vi.mock("@/lib/tables/actions", () => ({ saveTablePreference, resetTablePreference }))

beforeAll(() => {
  // Radix (and vaul's Drawer) probe for all of these in jsdom.
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

type Row = { id: string; name: string; email: string | null; phone: string | null; city: string | null }

const rows: Row[] = [
  {
    id: "1",
    name: "Ana Reyes",
    email: "ana.reyes.with.a.very.long.address@example.com",
    phone: "+63 917 555 0101",
    city: "Quezon City",
  },
  { id: "2", name: "Ben Cruz", email: null, phone: "+63 917 555 0202", city: "Makati" },
]

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { label: "Name", width: "name", locked: true },
    cell: ({ row }) => <a href={`/x/${row.original.id}`}>{row.original.name}</a>,
  },
  emailColumn<Row>((row) => row.email),
  phoneColumn<Row>((row) => row.phone),
  {
    accessorKey: "city",
    header: "Work City",
    meta: { label: "Work City", width: "text", optIn: true },
    cell: ({ row }) => row.original.city,
  },
]

/**
 * Header labels straight from the DOM.
 *
 * Deliberately not `getByRole("columnheader")`: the Drawer marks the rest of
 * the page `aria-hidden` while it is open, so a role query run with the picker
 * open reports every column as absent — which would let "the column is hidden"
 * pass whether or not anything actually happened.
 */
function headerTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "").trim(),
  )
}

function renderTable() {
  return render(
    <TablePreferencesProvider initial={{}}>
      <DataTable tableKey="test.people" columns={columns} data={rows} />
    </TablePreferencesProvider>,
  )
}

async function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /columns/i }))
  return screen.findByRole("dialog")
}

beforeEach(() => {
  saveTablePreference.mockClear()
  resetTablePreference.mockClear()
})

describe("DataTable — default rendering", () => {
  it("renders ordinary columns and omits opt-in columns", () => {
    const { container } = renderTable()
    expect(headerTexts(container)).toEqual(["Name", "Email", "Mobile"])
  })

  it("sizes columns from their declared width token rather than their contents", () => {
    const { container } = renderTable()
    const widths = Array.from(container.querySelectorAll("colgroup col")).map(
      (c) => (c as HTMLElement).style.width,
    )
    expect(widths).toHaveLength(3)

    // jsdom has no layout and no ResizeObserver, so this is the unmeasured
    // form: each column's share of `size` as a bare percentage. Bare is
    // load-bearing — Chrome drops a `<col>` width built with `calc()` or
    // `max()` under `table-fixed` and gives every column the same auto width.
    for (const width of widths) expect(width).toMatch(/^\d+(\.\d+)?%$/)

    // The declared ratio — read from the vocabulary rather than restated here,
    // so retuning a token is not a test failure.
    const [name, email, phone] = widths.map(Number.parseFloat)
    expect(name + email + phone).toBeCloseTo(100, 2)
    expect(email / name).toBeCloseTo(COLUMN_WIDTHS.email.size / COLUMN_WIDTHS.name.size, 3)
    expect(phone / name).toBeCloseTo(COLUMN_WIDTHS.phone.size / COLUMN_WIDTHS.name.size, 3)
  })

  it("gives two columns sharing a width token the identical style", () => {
    // The actual complaint this feature answers: a Mobile column that is one
    // width here and another width on the next screen.
    const twoPhones: ColumnDef<Row>[] = [
      phoneColumn<Row>((row) => row.phone),
      phoneColumn<Row>((row) => row.phone, { id: "alt", header: "Alt Mobile" }),
    ]
    const { container } = render(<DataTable columns={twoPhones} data={rows} />)
    const [a, b] = Array.from(container.querySelectorAll("colgroup col")).map(
      (c) => (c as HTMLElement).style.width,
    )
    expect(a).toBe(b)
  })

  it("renders an em dash for a missing value", () => {
    renderTable()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })
})

describe("column picker", () => {
  it("hides a column from the DOM when it is switched off", async () => {
    const { container } = renderTable()
    const dialog = await openPicker()

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Email" }))

    await waitFor(() => {
      expect(headerTexts(container)).toEqual(["Name", "Mobile"])
    })
    // Still on offer in the picker — hidden, not removed.
    expect(within(dialog).getByRole("checkbox", { name: "Email" })).toBeTruthy()
  })

  it("never offers a checkbox for a locked column", async () => {
    const { container } = renderTable()
    const dialog = await openPicker()

    expect(within(dialog).queryByRole("checkbox", { name: "Name" })).toBeNull()
    expect(within(dialog).getByText("Always shown")).toBeTruthy()
    // And the identifier column is still on screen.
    expect(headerTexts(container)).toContain("Name")
  })

  it("adds an opt-in column to the table when switched on", async () => {
    const { container } = renderTable()
    const dialog = await openPicker()

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Show Work City" }))

    await waitFor(() => {
      expect(headerTexts(container)).toContain("Work City")
    })
    expect(container.textContent).toContain("Quezon City")
  })

  it("persists the choice to the account", async () => {
    renderTable()
    const dialog = await openPicker()

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Email" }))

    await waitFor(() => expect(saveTablePreference).toHaveBeenCalled())
    const [tableKey, preference] = saveTablePreference.mock.calls[0] as unknown as [
      string,
      { hidden: string[] },
    ]
    expect(tableKey).toBe("test.people")
    expect(preference.hidden).toEqual(["email"])
  })

  it("starts from a saved layout instead of the defaults", () => {
    const { container } = render(
      <TablePreferencesProvider
        initial={{
          "test.people": {
            hidden: ["phone"],
            shown: ["city"],
            order: [],
            density: "Comfortable",
          },
        }}
      >
        <DataTable tableKey="test.people" columns={columns} data={rows} />
      </TablePreferencesProvider>,
    )
    expect(headerTexts(container)).toEqual(["Name", "Email", "Work City"])
  })

  it("changes the row height when density is switched to Compact", async () => {
    const { container } = renderTable()
    const dialog = await openPicker()

    fireEvent.click(within(dialog).getByRole("radio", { name: "Compact" }))

    await waitFor(() => {
      expect(container.querySelector("[data-density='Compact']")).toBeTruthy()
    })
    const cell = container.querySelector("tbody td") as HTMLElement
    expect(cell.className).toContain("py-1.5")
    expect(cell.className).not.toContain("py-3")
  })

  it("shows no picker at all for a table with no tableKey", () => {
    render(<DataTable columns={columns} data={rows} />)
    expect(screen.queryByRole("button", { name: /columns/i })).toBeNull()
  })
})

describe("copyable contact cells", () => {
  it("copies the full value, not the truncated one", async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })

    renderTable()
    fireEvent.click(screen.getByRole("button", { name: /copy email/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith("ana.reyes.with.a.very.long.address@example.com")
  })

  it("copies the mobile number in its canonical stored form", async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })

    renderTable()
    const buttons = screen.getAllByRole("button", { name: /copy mobile/i })
    fireEvent.click(buttons[0])

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("+63 917 555 0101"))
  })

  it("renders no copy button for a missing value", () => {
    renderTable()
    // Ben Cruz has no email, so only one row offers an email copy.
    expect(screen.getAllByRole("button", { name: /copy email/i })).toHaveLength(1)
  })
})
