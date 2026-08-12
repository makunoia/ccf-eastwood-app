import { describe, expect, it } from "vitest"
import {
  CLUSTER_EXPORT_COLUMNS,
  buildClusterExportColumns,
  buildClusterRegistrationsTable,
  clusterExportColumns,
  defaultSelectedColumns,
  eventColumnKey,
  type ClusterExportEvent,
  type ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"
import { toCSV } from "@/lib/csv-export"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_FIELD_KEYS,
  FORM_SECTION_KEYS,
  type EventFormConfigData,
  type FormToggleKey,
} from "@/lib/forms/context-config"
import { unionFormConfigs } from "@/lib/forms/registration-responses"

/**
 * Unit coverage for the cluster registrations export column model — which
 * columns get offered, how they're labelled, and how the chosen ones render.
 * The DB-backed half lives in tests/integration/cluster-registrations-export.
 */

function config(...on: FormToggleKey[]): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...Object.fromEntries(on.map((k) => [k, true])) }
}

const EVENTS: ClusterExportEvent[] = [
  { id: "evt-service", name: "Sunday Service" },
  { id: "evt-youth", name: "Youth Night" },
]

function row(
  overrides: Partial<ClusterRegistrationExportRow> = {}
): ClusterRegistrationExportRow {
  return {
    personKey: "member:m1",
    perEvent: { "evt-service": "CheckedIn" },
    registeredAt: "2026-03-01T01:30:00.000Z", // 09:30 in Asia/Manila
    viaSharedForm: true,
    checkedIn: true,
    checkedInAt: "2026-03-01T02:05:00.000Z", // 10:05 in Asia/Manila
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.com",
    mobile: "+63 917 123 4567",
    type: "Member",
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
    ...overrides,
  }
}

describe("buildClusterExportColumns", () => {
  it("offers the core columns even when the forms ask for nothing else", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [row()], EVENTS)

    expect(columns.every((c) => c.core)).toBe(true)
    expect(columns.map((c) => c.label)).toEqual([
      "First Name",
      "Last Name",
      "Mobile",
      "Email",
      "Type",
      // One column per cluster event, between the person and their timestamps.
      "Sunday Service",
      "Youth Night",
      "First Registered At",
      "Via Shared Form",
      "Checked In (any event)",
      "First Checked In At",
    ])
  })

  it("offers a column for every cluster event, even one nobody signed up for", () => {
    // A blank event column is information: it says the event drew nobody.
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [row()], EVENTS)
    const youth = columns.find((c) => c.key === eventColumnKey("evt-youth"))
    expect(youth).toMatchObject({ label: "Youth Night", core: true, hasData: false })
  })

  it("offers a field the form asks for even when nobody answered it", () => {
    const columns = buildClusterExportColumns(config("fieldWorkCity"), [row()])

    const workCity = columns.find((c) => c.key === "workCity")
    expect(workCity).toMatchObject({ collected: true, hasData: false, core: false })
  })

  it("keeps a field that is no longer asked but still holds answers", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [
      row({ gender: "Female" }),
    ])

    expect(columns.find((c) => c.key === "gender")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("drops a field that was never asked and holds nothing", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [row()])
    expect(columns.find((c) => c.key === "workCity")).toBeUndefined()
    expect(columns.find((c) => c.key === "dietary")).toBeUndefined()
  })

  it("only offers the Paid column once someone is actually marked paid", () => {
    // "Paid" renders Yes/No and is never blank, so a plain emptiness test would
    // offer it to every cluster, including free events that never charge.
    const unpaid = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [
      row({ isPaid: false }),
    ])
    expect(unpaid.find((c) => c.key === "isPaid")).toBeUndefined()

    const paid = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, [row({ isPaid: true })])
    expect(paid.find((c) => c.key === "isPaid")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("offers both payment columns once the form asks for payment", () => {
    const columns = buildClusterExportColumns(config("sectionPayment"), [row()])
    expect(columns.find((c) => c.key === "isPaid")).toMatchObject({ collected: true })
    expect(columns.find((c) => c.key === "paymentReference")).toMatchObject({
      collected: true,
    })
  })

  it("covers every form toggle that gathers data", () => {
    // Everything a registration form can ask for should be exportable — this
    // fails loudly when a new toggle ships without a matching column.
    //
    // Mobile and email are the exception: they became toggles in CCF-142, but
    // they were already *core* columns (`toggle: null`, always exported) because
    // they're the contact record rather than a form answer. Gating them on the
    // toggle would drop the column for an event that stopped collecting one,
    // hiding numbers already on the person's record.
    const covered = new Set(CLUSTER_EXPORT_COLUMNS.map((c) => c.toggle).filter(Boolean))
    const coreExported = new Set<string>(["fieldMobile", "fieldEmail"])
    const gathering: FormToggleKey[] = [...FORM_FIELD_KEYS, ...FORM_SECTION_KEYS]
    expect(
      gathering.filter((key) => !covered.has(key) && !coreExported.has(key))
    ).toEqual([])

    // …and those two really are exported, unconditionally.
    for (const key of ["mobile", "email"]) {
      expect(CLUSTER_EXPORT_COLUMNS.find((c) => c.key === key)?.toggle).toBeNull()
    }
  })

  it("defaults to every offered column", () => {
    const columns = buildClusterExportColumns(config("fieldGender"), [row()])
    expect(defaultSelectedColumns(columns)).toEqual(columns.map((c) => c.key))
  })
})

describe("buildClusterRegistrationsTable", () => {
  it("renders the selected columns, formatting times in Asia/Manila", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      [row({ nickname: "Johnny" })],
      ["firstName", "nickname", "registeredAt", "checkedIn", "checkedInAt"],
      EVENTS
    )

    expect(headers).toEqual([
      "First Name",
      "Nickname",
      "First Registered At",
      "Checked In (any event)",
      "First Checked In At",
    ])
    const [cell] = cells
    expect(cell[0]).toBe("Juan")
    expect(cell[1]).toBe("Johnny")
    expect(String(cell[2])).toMatch(/^2026-03-01 /)
    expect(String(cell[2]).toLowerCase()).toContain("9:30")
    expect(cell[3]).toBe("Yes")
    expect(String(cell[4]).toLowerCase()).toContain("10:05")
  })

  it("renders one column per event: checked in, registered, or blank", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      [
        row({ perEvent: { "evt-service": "CheckedIn", "evt-youth": "Registered" } }),
        row({ perEvent: { "evt-youth": "CheckedIn" } }),
      ],
      [eventColumnKey("evt-service"), eventColumnKey("evt-youth")],
      EVENTS
    )

    expect(headers).toEqual(["Sunday Service", "Youth Night"])
    expect(cells).toEqual([
      ["Checked in", "Registered"],
      ["", "Checked in"],
    ])
  })

  it("orders columns by the registry, not by the order they were ticked", () => {
    const { headers } = buildClusterRegistrationsTable(
      [row()],
      ["type", eventColumnKey("evt-service"), "lastName", "firstName"],
      EVENTS
    )
    expect(headers).toEqual(["First Name", "Last Name", "Type", "Sunday Service"])
  })

  it("renders every form answer when the whole set is selected", () => {
    const full = row({
      nickname: "Johnny",
      lifeStage: "Young Pro",
      birthDate: "March 1994",
      ageRange: "25–34",
      gender: "Male",
      language: "English, Filipino",
      meetingPreference: "Hybrid",
      schedule: "Wednesday, 19:00 – 21:00",
      workCity: "Makati",
      claimedSmallGroup: "Eastwood DGroup",
      breakoutGroup: "Table 4",
      household: "Dela Cruz Family (+2 members)",
      dietary: "Other — no shellfish",
      isPaid: true,
      paymentReference: "GC-0001",
      perEvent: { "evt-service": "CheckedIn", "evt-youth": "Registered" },
    })
    const keys = clusterExportColumns(EVENTS).map((c) => c.key)
    const { headers, cells } = buildClusterRegistrationsTable([full], keys, EVENTS)

    expect(headers).toHaveLength(keys.length)
    expect(cells[0]).toHaveLength(keys.length)
    expect(cells[0].every((c) => c !== null && String(c).trim() !== "")).toBe(true)
  })

  it("renders someone who never arrived with an empty timestamp", () => {
    const { cells } = buildClusterRegistrationsTable(
      [row({ checkedIn: false, checkedInAt: null })],
      ["checkedIn", "checkedInAt"],
      EVENTS
    )
    expect(cells[0]).toEqual(["No", ""])
  })

  it("returns headers only when there is nobody on the day", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      [],
      [eventColumnKey("evt-service")],
      EVENTS
    )
    expect(headers).toEqual(["Sunday Service"])
    expect(cells).toEqual([])
  })

  it("escapes event names and person names containing commas or quotes", () => {
    const events: ClusterExportEvent[] = [
      { id: "evt-youth", name: 'Youth Night, "Ignite"' },
    ]
    const { headers, cells } = buildClusterRegistrationsTable(
      [row({ lastName: "Dela Cruz, Jr.", perEvent: { "evt-youth": "Registered" } })],
      [eventColumnKey("evt-youth"), "lastName"],
      events
    )
    const csv = toCSV(headers, cells)
    expect(csv).toContain('"Youth Night, ""Ignite"""')
    expect(csv).toContain('"Dela Cruz, Jr."')
    // One header line + one data line — the embedded comma must not split rows.
    expect(csv.split("\r\n")).toHaveLength(2)
  })
})

describe("unionFormConfigs", () => {
  it("ORs a toggle on when any single form asks for it", () => {
    const merged = unionFormConfigs([
      config("fieldGender"),
      config("sectionDietary"),
      undefined,
    ])
    expect(merged.fieldGender).toBe(true)
    expect(merged.sectionDietary).toBe(true)
    expect(merged.fieldWorkCity).toBe(false)
  })

  it("returns the bare config for no forms at all", () => {
    expect(unionFormConfigs([])).toEqual(BARE_EVENT_FORM_CONFIG)
  })
})
