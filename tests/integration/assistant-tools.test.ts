import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { buildAssistantTools } from "@/lib/assistant/tools"
import { formatPhilippinePhone } from "@/lib/utils"

const superAdminSession = {
  user: {
    id: "u1",
    username: "test-admin",
    role: "SuperAdmin",
    permissions: [],
    eventAccess: [],
    totpEnabled: false,
    mustChangePassword: false,
    requiresTotpSetup: false,
  },
} as unknown as Session

// Staff session with no feature permissions at all.
const staffNoAccessSession = {
  user: {
    ...superAdminSession.user,
    role: "Staff",
    permissions: [],
  },
} as unknown as Session

const execOpts = { toolCallId: "test", messages: [], context: undefined }

type ExecutableTool = { execute?: (input: never, opts: never) => unknown }
async function run<T = unknown>(tool: ExecutableTool, input: unknown): Promise<T> {
  return (await tool.execute!(input as never, execOpts as never)) as T
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "Event", "EventRegistrant", "EventOccurrence", "OccurrenceAttendee", "LifeStage", "SchedulePreference" RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(
    superAdminSession as unknown as Awaited<ReturnType<typeof auth>>
  )
})

afterAll(async () => {
  await db.$disconnect()
})

describe("read tools", () => {
  it("search_members finds seeded members and respects limit + truncated", async () => {
    for (let i = 0; i < 5; i++) {
      await db.member.create({
        data: {
          firstName: `Maria${i}`,
          lastName: "Santos",
          dateJoined: new Date(),
          language: [],
        },
      })
    }
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{
      rows: { name: string }[]
      totalCount: number
      truncated: boolean
    }>(tools.search_members, { query: "Santos", limit: 2 })
    expect(result.totalCount).toBe(5)
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(result.rows[0].name).toContain("Santos")
  })

  it("search_members matches a phone query after normalization", async () => {
    await db.member.create({
      data: {
        firstName: "Juan",
        lastName: "Dela Cruz",
        phone: formatPhilippinePhone("09171234567"),
        dateJoined: new Date(),
        language: [],
      },
    })
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ totalCount: number }>(tools.search_members, {
      query: "09171234567",
    })
    expect(result.totalCount).toBe(1)
  })

  it("get_event_attendance_stats counts per-occurrence attendees", async () => {
    const event = await db.event.create({
      data: {
        name: "Recurring Service",
        type: "Recurring",
        startDate: new Date("2026-01-02"),
        endDate: new Date("2026-12-25"),
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walk", lastName: "In" },
    })
    const occ1 = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-01-02") },
    })
    await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-01-09") },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: occ1.id, registrantId: registrant.id },
    })

    const tools = buildAssistantTools(superAdminSession)
    const stats = await run<{
      totalRegistrants: number
      sessions: { attendeeCount: number }[]
    }>(tools.get_event_attendance_stats, { eventId: event.id })
    expect(stats.totalRegistrants).toBe(1)
    expect(stats.sessions).toHaveLength(2)
    expect(stats.sessions[0].attendeeCount).toBe(1)
    expect(stats.sessions[1].attendeeCount).toBe(0)
  })

  it("permission-denied read returns an error object and no data", async () => {
    const tools = buildAssistantTools(staffNoAccessSession)
    const result = await run<{ error?: string }>(tools.search_members, {})
    expect(result.error).toMatch(/do not have access/i)
  })
})

describe("write tools", () => {
  it("create_member inserts a row with normalized phone", async () => {
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ success: boolean; data?: { id: string } }>(
      tools.create_member,
      {
        firstName: "Ana",
        lastName: "Reyes",
        phone: "09181234567",
      }
    )
    expect(result.success).toBe(true)
    const row = await db.member.findFirst({ where: { firstName: "Ana" } })
    expect(row?.phone).toBe("+63 918 123 4567")
  })

  it("create_member with a duplicate phone fails", async () => {
    await db.member.create({
      data: {
        firstName: "Existing",
        lastName: "Person",
        phone: "+63 918 123 4567",
        dateJoined: new Date(),
        language: [],
      },
    })
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ success: boolean; error?: string }>(tools.create_member, {
      firstName: "Ana",
      lastName: "Reyes",
      phone: "0918 123 4567",
    })
    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(1)
  })

  it("update_member merges a patch without clobbering other fields", async () => {
    const m = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Reyes",
        email: "ana@example.com",
        workCity: "Quezon City",
        dateJoined: new Date("2025-01-15"),
        language: ["Tagalog"],
      },
    })
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ success: boolean }>(tools.update_member, {
      memberId: m.id,
      patch: { phone: "09171112222" },
    })
    expect(result.success).toBe(true)
    const updated = await db.member.findUnique({ where: { id: m.id } })
    expect(updated?.phone).toBe("+63 917 111 2222")
    expect(updated?.email).toBe("ana@example.com")
    expect(updated?.workCity).toBe("Quezon City")
    expect(updated?.language).toEqual(["Tagalog"])
  })

  it("mark_registrant_paid sets isPaid and reference", async () => {
    const event = await db.event.create({
      data: {
        name: "Camp",
        type: "OneTime",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-01"),
        price: 150000,
      },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Pay", lastName: "Er" },
    })
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ success: boolean }>(tools.mark_registrant_paid, {
      eventId: event.id,
      registrantId: registrant.id,
      paymentReference: "GC-20394",
    })
    expect(result.success).toBe(true)
    const updated = await db.eventRegistrant.findUnique({ where: { id: registrant.id } })
    expect(updated?.isPaid).toBe(true)
    expect(updated?.paymentReference).toBe("GC-20394")
  })

  it("write tool without permission does not touch the database", async () => {
    // Both the tool factory session and the mocked auth() session are Staff
    // with no permissions — the tool-level check and the wrapped action's
    // requireWrite() must both deny.
    vi.mocked(auth).mockResolvedValue(
      staffNoAccessSession as unknown as Awaited<ReturnType<typeof auth>>
    )
    const tools = buildAssistantTools(staffNoAccessSession)
    const result = await run<{ error?: string }>(tools.create_member, {
      firstName: "Nope",
      lastName: "Denied",
    })
    expect(result.error).toMatch(/do not have access/i)
    expect(await db.member.count()).toBe(0)
  })

  it("wrapped action denies even if the tool-level check were bypassed", async () => {
    // Simulate a compromised tool layer: factory session says SuperAdmin, but
    // the real auth() session (which the server action checks) is Staff.
    vi.mocked(auth).mockResolvedValue(
      staffNoAccessSession as unknown as Awaited<ReturnType<typeof auth>>
    )
    const tools = buildAssistantTools(superAdminSession)
    const result = await run<{ success?: boolean; error?: string }>(tools.create_member, {
      firstName: "Still",
      lastName: "Denied",
    })
    expect(result.success).toBe(false)
    expect(await db.member.count()).toBe(0)
  })
})
