import { describe, expect, it } from "vitest"
import {
  EVENT_EXPORT_GROUPS,
  buildEventRegistrationColumns,
  buildEventRegistrationsTable,
  eventRegistrationColumns,
  type EventRegistrationExportRow,
} from "@/lib/exports/event-registrations"
import { defaultSelectedColumns } from "@/lib/exports/columns"
import { toCSV } from "@/lib/csv-export"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_FIELD_KEYS,
  FORM_SECTION_KEYS,
  type EventFormConfigData,
  type FormToggleKey,
} from "@/lib/forms/context-config"
import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * Unit coverage for the single-event registrations export column model — which
 * columns get offered, how the event's type shapes the registration record, and
 * how the chosen ones render. The DB-backed half lives in
 * tests/integration/event-registrations-export.
 */

function config(...on: FormToggleKey[]): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...Object.fromEntries(on.map((k) => [k, true])) }
}

function row(
  overrides: Partial<EventRegistrationExportRow> = {}
): EventRegistrationExportRow {
  return {
    registrantId: "reg-1",
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.com",
    mobile: "+63 917 123 4567",
    type: "Member",
    registeredAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
    attendedAt: null,
    sessionsAttended: 0,
    sessionDates: null,
    nickname: null,
    lifeStage: null,
    birthDate: null,
    ageRange: null,
    gender: null,
    language: null,
    meetingPreference: null,
    schedule: null,
    workCity: null,
    claimedSmallGroup: null,
    breakoutGroup: null,
    household: null,
    dietary: null,
    isPaid: false,
    paymentReference: null,
    baptismOptIn: false,
    bus: null,
    busDirection: null,
    ...overrides,
  }
}

const noModules: EventModuleType[] = []

describe("buildEventRegistrationColumns", () => {
  it("offers the core columns with a bare config", () => {
    const columns = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row()],
      "OneTime"
    )
    expect(columns.map((c) => c.label)).toEqual([
      "First Name",
      "Last Name",
      "Mobile",
      "Email",
      "Type",
      "Registered At",
      "Attended",
      "Attended At",
    ])
    expect(columns.every((c) => c.core)).toBe(true)
  })

  it("gives a session event the attendance summary instead of Attended", () => {
    for (const type of ["MultiDay", "Recurring"] as const) {
      const labels = buildEventRegistrationColumns(
        BARE_EVENT_FORM_CONFIG,
        noModules,
        [row()],
        type
      ).map((c) => c.label)
      expect(labels).toContain("Sessions Attended")
      expect(labels).toContain("Sessions Attended (dates)")
      expect(labels).not.toContain("Attended")
      expect(labels).not.toContain("Attended At")
    }
  })

  it("offers a still-asked field even when nobody answered it", () => {
    const columns = buildEventRegistrationColumns(
      config("fieldWorkCity"),
      noModules,
      [row()],
      "OneTime"
    )
    const workCity = columns.find((c) => c.key === "workCity")
    expect(workCity).toMatchObject({ core: false, collected: true, hasData: false })
  })

  it("keeps a no-longer-asked field that still holds answers", () => {
    const columns = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row({ workCity: "Makati" })],
      "OneTime"
    )
    expect(columns.find((c) => c.key === "workCity")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("drops a field that was never asked and holds nothing", () => {
    const columns = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row()],
      "OneTime"
    )
    expect(columns.map((c) => c.key)).not.toContain("workCity")
  })

  it("offers the payment columns only once someone is actually paid", () => {
    const unpaid = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row()],
      "OneTime"
    )
    expect(unpaid.map((c) => c.key)).not.toContain("isPaid")

    const paid = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row({ isPaid: true, paymentReference: "GC-9001" })],
      "OneTime"
    )
    expect(paid.map((c) => c.key)).toEqual(expect.arrayContaining(["isPaid", "paymentReference"]))
  })

  it("offers the module columns when the module is on, even with no records", () => {
    const columns = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      ["Baptism", "Embarkation"],
      [row()],
      "OneTime"
    )
    expect(columns.find((c) => c.key === "baptismOptIn")).toMatchObject({
      core: false,
      collected: true,
      hasData: false,
    })
    expect(columns.find((c) => c.key === "bus")).toMatchObject({ collected: true })
  })

  it("drops the module columns when the module is off and nothing was recorded", () => {
    const keys = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row()],
      "OneTime"
    ).map((c) => c.key)
    expect(keys).not.toContain("baptismOptIn")
    expect(keys).not.toContain("bus")
    expect(keys).not.toContain("busDirection")
  })

  it("keeps a module column whose module was switched off after records existed", () => {
    // Same rule as a form toggle: a value is never hidden.
    const columns = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row({ baptismOptIn: true, bus: "Bus A", busDirection: "ToVenue" })],
      "OneTime"
    )
    expect(columns.find((c) => c.key === "baptismOptIn")).toMatchObject({
      collected: false,
      hasData: true,
    })
    expect(columns.find((c) => c.key === "bus")).toMatchObject({ collected: false, hasData: true })
  })

  it("covers every form toggle that gathers data", () => {
    // Everything a registration form can ask for should be exportable — this
    // fails loudly when a new toggle ships without a matching column.
    //
    // Mobile and email are the exception: they became toggles in CCF-142, but
    // they're core columns (`toggle: null`, always exported) because they're the
    // contact record rather than a form answer. Gating them on the toggle would
    // drop the column for an event that stopped collecting one, hiding numbers
    // already on the person's record.
    const covered = new Set(
      eventRegistrationColumns("OneTime")
        .map((c) => c.toggle)
        .filter(Boolean)
    )
    const coreExported = new Set<string>(["fieldMobile", "fieldEmail"])
    const gathering: FormToggleKey[] = [...FORM_FIELD_KEYS, ...FORM_SECTION_KEYS]
    expect(gathering.filter((key) => !covered.has(key) && !coreExported.has(key))).toEqual([])

    for (const key of ["mobile", "email"]) {
      expect(eventRegistrationColumns("OneTime").find((c) => c.key === key)?.toggle).toBeNull()
    }
  })

  it("every column belongs to a declared group", () => {
    for (const type of ["OneTime", "MultiDay", "Recurring"] as const) {
      for (const column of eventRegistrationColumns(type)) {
        expect(EVENT_EXPORT_GROUPS).toContain(column.group)
      }
    }
  })

  it("defaults to every offered column", () => {
    const columns = buildEventRegistrationColumns(
      config("fieldGender"),
      noModules,
      [row()],
      "OneTime"
    )
    expect(defaultSelectedColumns(columns)).toEqual(columns.map((c) => c.key))
  })
})

describe("buildEventRegistrationsTable", () => {
  it("renders the selected columns with Asia/Manila timestamps", () => {
    const { headers, cells } = buildEventRegistrationsTable(
      [row({ attendedAt: "2026-03-01T02:05:00.000Z" })],
      ["firstName", "lastName", "registeredAt", "attended", "attendedAt"],
      "OneTime"
    )
    expect(headers).toEqual([
      "First Name",
      "Last Name",
      "Registered At",
      "Attended",
      "Attended At",
    ])
    const [cell] = cells
    expect(cell[0]).toBe("Juan")
    expect(String(cell[2]).startsWith("2026-03-01")).toBe(true)
    expect(cell[3]).toBe("Yes")
    expect(String(cell[4]).toLowerCase()).toContain("10:05")
  })

  it("renders a no-show's attendance as No with an empty timestamp", () => {
    const { cells } = buildEventRegistrationsTable([row()], ["attended", "attendedAt"], "OneTime")
    expect(cells[0]).toEqual(["No", ""])
  })

  it("renders the session summary for a session event", () => {
    const { cells } = buildEventRegistrationsTable(
      [row({ sessionsAttended: 2, sessionDates: "2026-03-01; 2026-03-08" })],
      ["sessionsAttended", "sessionDates"],
      "MultiDay"
    )
    expect(cells[0]).toEqual([2, "2026-03-01; 2026-03-08"])
  })

  it("follows the registry order, not the order the boxes were ticked", () => {
    const { headers } = buildEventRegistrationsTable(
      [row()],
      ["registeredAt", "type", "firstName"],
      "OneTime"
    )
    expect(headers).toEqual(["First Name", "Type", "Registered At"])
  })

  it("renders every form answer when all of them are selected", () => {
    const filled = row({
      nickname: "JD",
      lifeStage: "Young Pro",
      birthDate: "March 1994",
      ageRange: "25–34",
      gender: "Male",
      language: "English, Tagalog",
      meetingPreference: "In Person",
      schedule: "Saturday, 18:00 – 20:00",
      workCity: "Makati",
      claimedSmallGroup: "Team Ignite",
      breakoutGroup: "Table 3",
      household: "Dela Cruz Family",
      dietary: "Halal",
      isPaid: true,
      paymentReference: "GC-9001",
      baptismOptIn: true,
      bus: "Bus A",
      busDirection: "ToVenue",
    })
    const columns = buildEventRegistrationColumns(
      config(
        "fieldNickname",
        "fieldLifeStage",
        "fieldBirthDate",
        "fieldAgeRange",
        "fieldGender",
        "fieldLanguage",
        "fieldMeetingPreference",
        "fieldSchedule",
        "fieldWorkCity",
        "sectionSmallGroup",
        "sectionBreakout",
        "sectionFamily",
        "sectionDietary",
        "sectionPayment"
      ),
      ["Baptism", "Embarkation"],
      [filled],
      "OneTime"
    )
    const { headers, cells } = buildEventRegistrationsTable(
      [filled],
      defaultSelectedColumns(columns),
      "OneTime"
    )
    expect(headers).toHaveLength(cells[0].length)
    expect(cells[0]).toEqual(expect.arrayContaining(["JD", "Makati", "Halal", "Bus A", "Yes"]))
  })

  it("returns headers only when there are no rows", () => {
    const { headers, cells } = buildEventRegistrationsTable([], ["firstName"], "OneTime")
    expect(headers).toEqual(["First Name"])
    expect(cells).toEqual([])
  })

  it("escapes names carrying commas and quotes", () => {
    const { headers, cells } = buildEventRegistrationsTable(
      [row({ firstName: 'Juan "JD"', lastName: "Dela Cruz, Jr." })],
      ["firstName", "lastName"],
      "OneTime"
    )
    // The whole record must stay on one CSV line despite the punctuation.
    expect(toCSV(headers, cells).split("\r\n")).toHaveLength(2)
    expect(toCSV(headers, cells)).toContain('"Juan ""JD"""')
  })
})

// ── Regression: nothing the old fixed-column export emitted was lost ──────────

describe("parity with the export this replaced", () => {
  /**
   * The old client-side `exportRegistrantsCSV` emitted a fixed 7–10 columns.
   * Every one of them must still be reachable, or the rewrite quietly cost an
   * admin data they had before.
   */
  it("still offers every column the fixed export emitted", () => {
    const filled = row({
      nickname: "JD",
      isPaid: true,
      paymentReference: "GC-9001",
      attendedAt: "2026-03-01T02:05:00.000Z",
    })
    const labels = buildEventRegistrationColumns(
      config("fieldNickname", "sectionPayment"),
      noModules,
      [filled],
      "OneTime"
    ).map((c) => c.label)

    for (const label of [
      "First Name",
      "Last Name",
      "Nickname",
      "Mobile",
      "Email",
      "Type",
      "Paid",
      "Payment Reference",
      "Attended",
    ]) {
      expect(labels).toContain(label)
    }
  })

  it("still offers a Registered column on session events", () => {
    const labels = buildEventRegistrationColumns(
      BARE_EVENT_FORM_CONFIG,
      noModules,
      [row()],
      "Recurring"
    ).map((c) => c.label)
    expect(labels).toContain("Registered At")
  })
})
