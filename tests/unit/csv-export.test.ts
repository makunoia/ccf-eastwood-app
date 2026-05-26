import { describe, it, expect } from "vitest"
import { toCSV, formatDayOfWeek } from "@/lib/csv-export"

describe("toCSV", () => {
  it("emits a CSV with CRLF row terminators", () => {
    const csv = toCSV(["A", "B"], [["1", "2"], ["3", "4"]])
    expect(csv).toBe("A,B\r\n1,2\r\n3,4")
  })

  it("escapes commas by wrapping the cell in quotes", () => {
    const csv = toCSV(["Name"], [["Cruz, Juan"]])
    expect(csv).toBe('Name\r\n"Cruz, Juan"')
  })

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCSV(["Note"], [['He said "hi"']])
    expect(csv).toBe('Note\r\n"He said ""hi"""')
  })

  it("escapes newlines inside cells", () => {
    const csv = toCSV(["Note"], [["Line 1\nLine 2"]])
    expect(csv).toBe('Note\r\n"Line 1\nLine 2"')
  })

  it("renders null and undefined as empty strings", () => {
    const csv = toCSV(["A", "B"], [[null, undefined]])
    expect(csv).toBe("A,B\r\n,")
  })

  it("renders numbers and booleans without quoting", () => {
    const csv = toCSV(["count", "active"], [[42, true]])
    expect(csv).toBe("count,active\r\n42,true")
  })

  it("preserves leading/trailing whitespace by quoting", () => {
    const csv = toCSV(["A"], [[" hi "]])
    expect(csv).toBe('A\r\n" hi "')
  })
})

describe("formatDayOfWeek", () => {
  it("maps 0..6 to Sunday..Saturday", () => {
    expect(formatDayOfWeek(0)).toBe("Sunday")
    expect(formatDayOfWeek(3)).toBe("Wednesday")
    expect(formatDayOfWeek(6)).toBe("Saturday")
  })

  it("returns empty string for null or undefined", () => {
    expect(formatDayOfWeek(null)).toBe("")
    expect(formatDayOfWeek(undefined)).toBe("")
  })

  it("returns empty string for out-of-range numbers", () => {
    expect(formatDayOfWeek(7)).toBe("")
    expect(formatDayOfWeek(-1)).toBe("")
  })
})
