import { describe, expect, it } from "vitest"
import {
  VOLUNTEER_EXPORT_GROUPS,
  buildEventVolunteerColumns,
  buildEventVolunteersTable,
  eventVolunteerColumns,
  type EventVolunteerExportRow,
} from "@/lib/exports/event-volunteers"
import { defaultSelectedColumns } from "@/lib/exports/columns"
import type { EventModuleType } from "@/app/generated/prisma/client"

function row(overrides: Partial<EventVolunteerExportRow> = {}): EventVolunteerExportRow {
  return {
    volunteerId: "vol-1",
    firstName: "Maria",
    lastName: "Santos",
    nickname: null,
    email: "maria@example.com",
    phone: "+63 917 111 2222",
    lifeStage: null,
    gender: null,
    birthDate: null,
    smallGroup: null,
    committeeName: "Ushering",
    preferredRole: "Greeter",
    assignedRole: null,
    status: "Confirmed",
    notes: null,
    leaderNotes: null,
    signedUpAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
    bus: null,
    busDirection: null,
    ...overrides,
  }
}

const noModules: EventModuleType[] = []

describe("buildEventVolunteerColumns", () => {
  it("offers the serving record with no modules and a bare roster", () => {
    const columns = buildEventVolunteerColumns(noModules, [row()])
    expect(columns.map((c) => c.label)).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Committee Name",
      "Role Name",
      "Assigned Role",
      "Status",
      "Signed Up At",
      "Notes",
    ])
  })

  it("offers the profile columns only once the roster holds them", () => {
    const columns = buildEventVolunteerColumns(noModules, [
      row({ nickname: "Mars", lifeStage: "Young Pro", smallGroup: "Team Ignite" }),
    ])
    const keys = columns.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(["nickname", "lifeStage", "smallGroup"]))
    expect(keys).not.toContain("gender")
    // Nobody was ever *asked* these on a form, so none of them may be flagged.
    expect(columns.every((c) => c.core)).toBe(true)
  })

  it("offers the bus columns when Embarkation is on, even before assignments", () => {
    const columns = buildEventVolunteerColumns(["Embarkation"], [row()])
    expect(columns.find((c) => c.key === "bus")).toMatchObject({
      core: false,
      collected: true,
      hasData: false,
    })
  })

  it("keeps the bus columns when Embarkation is off but assignments exist", () => {
    const columns = buildEventVolunteerColumns(noModules, [
      row({ bus: "Bus A", busDirection: "ToVenue" }),
    ])
    expect(columns.find((c) => c.key === "bus")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("drops the bus columns when Embarkation is off and nothing was assigned", () => {
    const keys = buildEventVolunteerColumns(noModules, [row()]).map((c) => c.key)
    expect(keys).not.toContain("bus")
    expect(keys).not.toContain("busDirection")
  })

  it("every column belongs to a declared group", () => {
    for (const column of eventVolunteerColumns()) {
      expect(VOLUNTEER_EXPORT_GROUPS).toContain(column.group)
    }
  })
})

describe("buildEventVolunteersTable", () => {
  it("keeps the import round-trip headers so an export can be re-imported", () => {
    // "Role Name" is the preferred role — the field the volunteer importer reads.
    const { headers, cells } = buildEventVolunteersTable(
      [row({ assignedRole: "Usher", notes: "Prefers early shift" })],
      defaultSelectedColumns(buildEventVolunteerColumns(noModules, [row()])),
    )
    expect(headers.slice(0, 8)).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Committee Name",
      "Role Name",
      "Assigned Role",
      "Status",
    ])
    expect(cells[0].slice(0, 8)).toEqual([
      "Maria",
      "Santos",
      "maria@example.com",
      "+63 917 111 2222",
      "Ushering",
      "Greeter",
      "Usher",
      "Confirmed",
    ])
  })

  it("renders the sign-up timestamp in Asia/Manila", () => {
    const { cells } = buildEventVolunteersTable([row()], ["signedUpAt"])
    expect(String(cells[0][0]).startsWith("2026-03-01")).toBe(true)
    expect(String(cells[0][0]).toLowerCase()).toContain("9:30")
  })

  it("follows the registry order, not the order the boxes were ticked", () => {
    const { headers } = buildEventVolunteersTable([row()], ["status", "firstName", "committeeName"])
    expect(headers).toEqual(["First Name", "Committee Name", "Status"])
  })

  it("returns headers only when there are no rows", () => {
    const { headers, cells } = buildEventVolunteersTable([], ["firstName"])
    expect(headers).toEqual(["First Name"])
    expect(cells).toEqual([])
  })
})
