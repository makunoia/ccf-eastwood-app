import { describe, expect, it } from "vitest"
import {
  CLUSTER_EXPORT_COLUMNS,
  buildClusterExportColumns,
  buildClusterRegistrationsTable,
  clusterExportColumns,
  collapseRegistrationsToPeople,
  defaultSelectedColumns,
  eventCheckInColumnKey,
  eventColumnKey,
  type ClusterExportEvent,
  type ClusterRegistrationExportRow,
  type ClusterRegistrationRecord,
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
 * columns get offered, how they're labelled, how per-event participation
 * collapses onto one row per person, and how the chosen columns render.
 * The DB-backed half lives in tests/integration/cluster-registrations-export.
 */

const EVENTS: ClusterExportEvent[] = [
  { id: "svc", name: "Service" },
  { id: "yth", name: "Youth Night" },
]

function config(...on: FormToggleKey[]): EventFormConfigData {
  return { ...BARE_EVENT_FORM_CONFIG, ...Object.fromEntries(on.map((k) => [k, true])) }
}

function record(
  overrides: Partial<ClusterRegistrationRecord> = {}
): ClusterRegistrationRecord {
  return {
    personKey: "member:m1",
    eventId: "svc",
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

function row(
  overrides: Partial<ClusterRegistrationExportRow> = {}
): ClusterRegistrationExportRow {
  const { eventId: _eventId, ...base } = record()
  return { ...base, events: { svc: { checkedIn: true } }, ...overrides }
}

describe("collapseRegistrationsToPeople", () => {
  it("exports one row per person, with a per-event cell for each registration", () => {
    const people = collapseRegistrationsToPeople([
      record({ eventId: "svc", checkedIn: true }),
      record({ eventId: "yth", checkedIn: false, checkedInAt: null }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].events).toEqual({
      svc: { checkedIn: true },
      yth: { checkedIn: false },
    })
  })

  it("keeps different people apart, sorted by last then first name", () => {
    const people = collapseRegistrationsToPeople([
      record({ personKey: "guest:g1", firstName: "Pedro", lastName: "Reyes" }),
      record({ personKey: "member:m1", firstName: "Maria", lastName: "Santos" }),
      record({ personKey: "registrant:r1", firstName: "Ana", lastName: "Lopez" }),
    ])

    expect(people.map((p) => p.lastName)).toEqual(["Lopez", "Reyes", "Santos"])
  })

  it("rolls the person's registration metadata up across their events", () => {
    const [person] = collapseRegistrationsToPeople([
      record({
        eventId: "svc",
        registeredAt: "2026-03-01T01:30:00.000Z",
        viaSharedForm: false,
        checkedIn: false,
        checkedInAt: null,
        isPaid: false,
      }),
      record({
        eventId: "yth",
        registeredAt: "2026-03-01T00:15:00.000Z",
        viaSharedForm: true,
        checkedIn: true,
        checkedInAt: "2026-03-01T02:05:00.000Z",
        isPaid: true,
      }),
    ])

    // Earliest of the two registrations, and "did they turn up anywhere".
    expect(person.registeredAt).toBe("2026-03-01T00:15:00.000Z")
    expect(person.checkedIn).toBe(true)
    expect(person.checkedInAt).toBe("2026-03-01T02:05:00.000Z")
    expect(person.viaSharedForm).toBe(true)
    expect(person.isPaid).toBe(true)
  })

  it("merges the values that are genuinely per-event instead of dropping one", () => {
    const [person] = collapseRegistrationsToPeople([
      record({ eventId: "svc", breakoutGroup: "Table 4", paymentReference: "GC-0001" }),
      record({ eventId: "yth", breakoutGroup: "Table 9", paymentReference: "GC-0002" }),
    ])

    expect(person.breakoutGroup).toBe("Table 4; Table 9")
    expect(person.paymentReference).toBe("GC-0001; GC-0002")
  })

  it("de-duplicates a merged value repeated across events", () => {
    const [person] = collapseRegistrationsToPeople([
      record({ eventId: "svc", breakoutGroup: "Table 4" }),
      record({ eventId: "yth", breakoutGroup: "Table 4" }),
    ])
    expect(person.breakoutGroup).toBe("Table 4")
  })

  it("edge case — fills a sparse walk-in row from the person's fuller registration", () => {
    // Registrations arrive in cluster order, so a bare walk-in on the first
    // event must not blank out answers the second event actually collected.
    const [person] = collapseRegistrationsToPeople([
      record({ eventId: "svc", email: null, nickname: null, workCity: null }),
      record({ eventId: "yth", email: "juan@example.com", nickname: "Johnny", workCity: "Makati" }),
    ])

    expect(person).toMatchObject({
      email: "juan@example.com",
      nickname: "Johnny",
      workCity: "Makati",
    })
  })

  it("edge case — the earliest event of the day wins a genuine disagreement", () => {
    const [person] = collapseRegistrationsToPeople([
      record({ eventId: "svc", nickname: "Johnny" }),
      record({ eventId: "yth", nickname: "JD" }),
    ])
    expect(person.nickname).toBe("Johnny")
  })

  it("edge case — returns nothing for no registrations", () => {
    expect(collapseRegistrationsToPeople([])).toEqual([])
  })
})

describe("clusterExportColumns", () => {
  it("adds a Yes/No column per event, in cluster order, for both groups", () => {
    const columns = clusterExportColumns(EVENTS)

    expect(columns.filter((c) => c.group === "Events").map((c) => c.label)).toEqual([
      "Service",
      "Youth Night",
    ])
    expect(
      columns.filter((c) => c.group === "Event Check-ins").map((c) => c.label)
    ).toEqual(["Service (Checked In)", "Youth Night (Checked In)"])
  })

  it("keys event columns off the event id so two events can share a name", () => {
    const columns = clusterExportColumns([
      { id: "a", name: "Service" },
      { id: "b", name: "Service" },
    ])
    const keys = columns.filter((c) => c.group === "Events").map((c) => c.key)
    expect(keys).toEqual([eventColumnKey("a"), eventColumnKey("b")])
    expect(new Set(keys).size).toBe(2)
  })

  it("keeps the fixed registry when the cluster has no events", () => {
    expect(clusterExportColumns([]).map((c) => c.key)).toEqual(
      CLUSTER_EXPORT_COLUMNS.map((c) => c.key)
    )
  })
})

describe("buildClusterExportColumns", () => {
  it("offers the core columns even when the forms ask for nothing else", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [row()])

    expect(columns.every((c) => c.core)).toBe(true)
    expect(columns.map((c) => c.label)).toEqual([
      "First Name",
      "Last Name",
      "Mobile",
      "Email",
      "Type",
      "Service",
      "Youth Night",
      "Service (Checked In)",
      "Youth Night (Checked In)",
      "First Registered At",
      "Via Shared Form",
      "Checked In (Any Event)",
      "First Checked In At",
    ])
  })

  it("offers an event column even when nobody registered for that event", () => {
    // A column of "No" answers "who came to this one" — it isn't a blank column.
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [
      row({ events: { svc: { checkedIn: true } } }),
    ])

    expect(columns.find((c) => c.key === eventColumnKey("yth"))).toMatchObject({
      core: true,
      hasData: true,
    })
  })

  it("offers a field the form asks for even when nobody answered it", () => {
    const columns = buildClusterExportColumns(config("fieldWorkCity"), EVENTS, [row()])

    const workCity = columns.find((c) => c.key === "workCity")
    expect(workCity).toMatchObject({ collected: true, hasData: false, core: false })
  })

  it("keeps a field that is no longer asked but still holds answers", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [
      row({ gender: "Female" }),
    ])

    expect(columns.find((c) => c.key === "gender")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("drops a field that was never asked and holds nothing", () => {
    const columns = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [row()])
    expect(columns.find((c) => c.key === "workCity")).toBeUndefined()
    expect(columns.find((c) => c.key === "dietary")).toBeUndefined()
  })

  it("only offers the Paid column once someone is actually marked paid", () => {
    // "Paid" renders Yes/No and is never blank, so a plain emptiness test would
    // offer it to every cluster, including free events that never charge.
    const unpaid = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [
      row({ isPaid: false }),
    ])
    expect(unpaid.find((c) => c.key === "isPaid")).toBeUndefined()

    const paid = buildClusterExportColumns(BARE_EVENT_FORM_CONFIG, EVENTS, [
      row({ isPaid: true }),
    ])
    expect(paid.find((c) => c.key === "isPaid")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })

  it("offers both payment columns once the form asks for payment", () => {
    const columns = buildClusterExportColumns(config("sectionPayment"), EVENTS, [row()])
    expect(columns.find((c) => c.key === "isPaid")).toMatchObject({ collected: true })
    expect(columns.find((c) => c.key === "paymentReference")).toMatchObject({
      collected: true,
    })
  })

  it("covers every form toggle that gathers data", () => {
    // Everything a registration form can ask for should be exportable — this
    // fails loudly when a new toggle ships without a matching column.
    const covered = new Set(CLUSTER_EXPORT_COLUMNS.map((c) => c.toggle).filter(Boolean))
    const gathering: FormToggleKey[] = [...FORM_FIELD_KEYS, ...FORM_SECTION_KEYS]
    expect(gathering.filter((key) => !covered.has(key))).toEqual([])
  })

  it("defaults to every offered column", () => {
    const columns = buildClusterExportColumns(config("fieldGender"), EVENTS, [row()])
    expect(defaultSelectedColumns(columns)).toEqual(columns.map((c) => c.key))
  })
})

describe("buildClusterRegistrationsTable", () => {
  it("renders one row per person with Yes/No for each of the day's events", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      EVENTS,
      [
        row({
          firstName: "Maria",
          lastName: "Santos",
          events: { svc: { checkedIn: true }, yth: { checkedIn: false } },
        }),
      ],
      [
        "firstName",
        eventColumnKey("svc"),
        eventColumnKey("yth"),
        eventCheckInColumnKey("svc"),
        eventCheckInColumnKey("yth"),
      ]
    )

    expect(headers).toEqual([
      "First Name",
      "Service",
      "Youth Night",
      "Service (Checked In)",
      "Youth Night (Checked In)",
    ])
    expect(cells).toEqual([["Maria", "Yes", "Yes", "Yes", "No"]])
  })

  it("marks an event the person is not on as No", () => {
    const { cells } = buildClusterRegistrationsTable(
      EVENTS,
      [row({ events: { svc: { checkedIn: false } } })],
      [eventColumnKey("svc"), eventColumnKey("yth"), eventCheckInColumnKey("yth")]
    )
    expect(cells).toEqual([["Yes", "No", "No"]])
  })

  it("renders the selected columns, formatting times in Asia/Manila", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      EVENTS,
      [row({ nickname: "Johnny" })],
      ["firstName", "nickname", "registeredAt", "checkedIn", "checkedInAt"]
    )

    expect(headers).toEqual([
      "First Name",
      "Nickname",
      "First Registered At",
      "Checked In (Any Event)",
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

  it("orders columns by the registry, not by the order they were ticked", () => {
    const { headers } = buildClusterRegistrationsTable(
      EVENTS,
      [row()],
      ["type", eventColumnKey("svc"), "lastName", "firstName"]
    )
    expect(headers).toEqual(["First Name", "Last Name", "Type", "Service"])
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
    })
    const keys = clusterExportColumns(EVENTS).map((c) => c.key)
    const { headers, cells } = buildClusterRegistrationsTable(EVENTS, [full], keys)

    expect(headers).toHaveLength(keys.length)
    expect(cells[0]).toHaveLength(keys.length)
    expect(cells[0].every((c) => c !== null && String(c).trim() !== "")).toBe(true)
  })

  it("renders an unchecked-in registrant with an empty timestamp", () => {
    const { cells } = buildClusterRegistrationsTable(
      EVENTS,
      [row({ checkedIn: false, checkedInAt: null })],
      ["checkedIn", "checkedInAt"]
    )
    expect(cells[0]).toEqual(["No", ""])
  })

  it("returns headers only when there are no registrants", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      EVENTS,
      [],
      [eventColumnKey("svc")]
    )
    expect(headers).toEqual(["Service"])
    expect(cells).toEqual([])
  })

  it("escapes names and event headers containing commas or quotes", () => {
    const { headers, cells } = buildClusterRegistrationsTable(
      [{ id: "yth", name: 'Youth Night, "Ignite"' }],
      [row({ lastName: "Dela Cruz, Jr.", events: { yth: { checkedIn: true } } })],
      ["lastName", eventColumnKey("yth")]
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
