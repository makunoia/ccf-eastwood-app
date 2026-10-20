import { describe, expect, it } from "vitest"
import { buildCatchMechAttendance, type AttendanceRegistration } from "@/lib/catch-mech/attendance"

const occurrences = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-19", "2026-10-22"].map((date) => ({ id: date, date: new Date(date) }))
const now = new Date("2026-10-19T03:00:00Z")
function registration(id: string, dates: string[], extra: Partial<AttendanceRegistration> = {}): AttendanceRegistration {
  return { id, memberId: null, guestId: "g1", createdAt: new Date("2026-09-30T17:00:00Z"), attendedAt: null,
    occurrenceAttendances: dates.map((date) => ({ occurrenceId: date, occurrence: { date: new Date(date) } })), ...extra }
}

describe("Catch Mech attendance context", () => {
  it("deduplicates visits across registrations, uses earliest signup, and excludes today from the rate", () => {
    const rows = [registration("r1", ["2026-10-01", "2026-10-15"]), registration("r2", ["2026-10-15", "2026-10-19", "2026-10-22"], { createdAt: new Date("2026-10-12") })]
    const result = buildCatchMechAttendance("Recurring", rows, occurrences, now)
    expect(result.get("r1")).toEqual({ sessionsAttended: 3, returnCount: 2, attendanceRate: 2 / 3, signedUpAt: rows[0].createdAt.toISOString(), lastAttendedAt: "2026-10-19", oneTime: false })
    expect(result.get("r2")).toEqual(result.get("r1"))
  })
  it("preserves identity when a retained guest points to their promoted member", () => {
    const rows = [registration("guest", ["2026-10-01"], { guest: { memberId: "m1" } }), registration("member", ["2026-10-08"], { memberId: "m1", guestId: null })]
    expect(buildCatchMechAttendance("MultiDay", rows, occurrences, now).get("member")?.sessionsAttended).toBe(2)
  })
  it("uses Manila signup dates and does not invent missing occurrences", () => {
    const row = registration("r1", ["2026-10-15"], { createdAt: new Date("2026-10-08T17:00:00Z") })
    expect(buildCatchMechAttendance("Recurring", [row], occurrences, now).get("r1")?.attendanceRate).toBe(1)
  })
  it("returns no percentage when there are no sessions in the rate window", () => {
    const row = registration("r1", ["2026-10-19"], { createdAt: now })
    expect(buildCatchMechAttendance("Recurring", [row], occurrences, now).get("r1")).toMatchObject({ attendanceRate: null, returnCount: 0, sessionsAttended: 1 })
  })
  it("handles no attendance and OneTime attendance without returns or a percentage", () => {
    expect(buildCatchMechAttendance("Recurring", [registration("r1", [])], occurrences, now).get("r1")).toMatchObject({ sessionsAttended: 0, lastAttendedAt: null, attendanceRate: 0 })
    expect(buildCatchMechAttendance("OneTime", [registration("r1", [], { attendedAt: now })], [], now).get("r1")).toMatchObject({ oneTime: true, sessionsAttended: 1, returnCount: 0, attendanceRate: null })
  })
})

it("ignores attendance linked to another event's occurrence", () => {
  const row = registration("r1", ["2026-10-01", "2026-10-02"])
  expect(buildCatchMechAttendance("Recurring", [row], [occurrences[0]], now).get("r1")?.sessionsAttended).toBe(1)
})
