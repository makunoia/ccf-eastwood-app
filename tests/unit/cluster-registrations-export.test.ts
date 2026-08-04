import { describe, expect, it } from "vitest"
import {
  buildClusterRegistrationsTable,
  type ClusterRegistrationExportRow,
} from "@/lib/export-entities"
import { toCSV } from "@/lib/csv-export"

/**
 * Unit coverage for the Event Cluster registrations CSV table builder — the
 * pure half of the export (column set, Manila-time formatting, booleans).
 * The DB-backed half lives in tests/integration/cluster-registrations-export.
 */

function row(
  overrides: Partial<ClusterRegistrationExportRow> = {}
): ClusterRegistrationExportRow {
  return {
    eventName: "Sunday Service",
    firstName: "Juan",
    lastName: "Dela Cruz",
    nickname: "Johnny",
    email: "juan@example.com",
    mobile: "+63 917 123 4567",
    type: "Member",
    registeredAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
    viaSharedForm: true,
    checkedIn: true,
    checkedInAt: "2026-03-01T02:05:00.000Z", // 10:05 in Asia/Manila
    isPaid: true,
    paymentReference: "GC-0001",
    ...overrides,
  }
}

describe("buildClusterRegistrationsTable", () => {
  it("maps a registration to the full column set, formatting times in Asia/Manila", () => {
    const { headers, cells } = buildClusterRegistrationsTable([row()], true)

    expect(headers).toEqual([
      "Event",
      "First Name",
      "Last Name",
      "Nickname",
      "Email",
      "Mobile",
      "Type",
      "Registered At",
      "Via Shared Form",
      "Checked In",
      "Checked In At",
      "Paid",
      "Payment Reference",
    ])
    expect(cells).toHaveLength(1)
    const [cell] = cells
    expect(cell.slice(0, 7)).toEqual([
      "Sunday Service",
      "Juan",
      "Dela Cruz",
      "Johnny",
      "juan@example.com",
      "+63 917 123 4567",
      "Member",
    ])
    expect(String(cell[7])).toMatch(/^2026-03-01 /)
    expect(String(cell[7]).toLowerCase()).toContain("9:30")
    expect(cell[8]).toBe("Yes")
    expect(cell[9]).toBe("Yes")
    expect(String(cell[10]).toLowerCase()).toContain("10:05")
    expect(cell[11]).toBe("Yes")
    expect(cell[12]).toBe("GC-0001")
  })

  it("drops the payment columns when no event in the cluster charges", () => {
    const { headers, cells } = buildClusterRegistrationsTable([row()], false)

    expect(headers).not.toContain("Paid")
    expect(headers).not.toContain("Payment Reference")
    expect(headers).toHaveLength(11)
    expect(cells[0]).toHaveLength(11)
  })

  it("renders a not-yet-checked-in registration with an empty timestamp", () => {
    const { cells } = buildClusterRegistrationsTable(
      [row({ checkedIn: false, checkedInAt: null })],
      true
    )
    expect(cells[0][9]).toBe("No")
    expect(cells[0][10]).toBe("")
  })

  it("keeps blanks for a walk-in with no nickname, email, or mobile", () => {
    const { cells } = buildClusterRegistrationsTable(
      [
        row({
          nickname: null,
          email: null,
          mobile: "",
          type: "Guest",
          viaSharedForm: false,
          isPaid: false,
          paymentReference: null,
        }),
      ],
      true
    )
    expect(cells[0][3]).toBeNull()
    expect(cells[0][4]).toBeNull()
    expect(cells[0][5]).toBe("")
    expect(cells[0][6]).toBe("Guest")
    expect(cells[0][8]).toBe("No")
    expect(cells[0][11]).toBe("No")
    expect(cells[0][12]).toBeNull()
  })

  it("handles an empty registration list", () => {
    const { headers, cells } = buildClusterRegistrationsTable([], true)
    expect(headers).toHaveLength(13)
    expect(cells).toEqual([])
  })

  it("escapes event and person names containing commas or quotes", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      [row({ eventName: 'Youth Night, "Ignite"', lastName: "Dela Cruz, Jr." })],
      false
    )
    const csv = toCSV(headers, cells)
    expect(csv).toContain('"Youth Night, ""Ignite"""')
    expect(csv).toContain('"Dela Cruz, Jr."')
    // One header line + one data line — the embedded comma must not split rows.
    expect(csv.split("\r\n")).toHaveLength(2)
  })
})
