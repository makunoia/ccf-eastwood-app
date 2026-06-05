import { describe, expect, it } from "vitest"
import { parseFile } from "@/lib/import/parse-file"

async function createImportFile(rows: unknown[][]): Promise<File> {
  const XLSX = await import("xlsx")
  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true })
  return new File(
    [buffer],
    "import.xlsx",
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  )
}

describe("parseFile", () => {
  it("keeps local calendar dates for spreadsheet date cells", async () => {
    const file = await createImportFile([
      ["Date Joined"],
      [new Date(2024, 0, 15)],
    ])

    const parsed = await parseFile(file)

    expect(parsed.sheets[0]?.rows[0]?.[0]).toBe("2024-01-15")
  })

  it("preserves the time from spreadsheet datetime cells", async () => {
    const file = await createImportFile([
      ["Checked In At"],
      [new Date(2026, 0, 5, 14, 30, 0)],
    ])

    const parsed = await parseFile(file)

    expect(parsed.sheets[0]?.rows[0]?.[0]).toBe("2026-01-05 14:30")
  })
})
