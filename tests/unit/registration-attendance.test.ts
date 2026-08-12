import { describe, expect, it } from "vitest"

import { resolveRegistrationAttendance } from "@/lib/events/registration-attendance"

const NOW = new Date("2026-08-10T04:00:00.000Z") // noon Manila

function utc(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

const base = {
  attendedAt: null as Date | null,
  attendedCount: 0,
  occurrenceCount: 0,
}

describe("resolveRegistrationAttendance — OneTime", () => {
  it("reads attendance off attendedAt", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "OneTime", endDate: utc("2026-07-01"), attendedAt: utc("2026-07-01") },
        NOW,
      ),
    ).toEqual({ label: "Attended", tone: "attended" })
  })

  it("marks a no-show on a finished event absent", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "OneTime", endDate: utc("2026-07-01") },
        NOW,
      ),
    ).toEqual({ label: "Absent", tone: "absent" })
  })

  it("does not call a future registration absent", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "OneTime", endDate: utc("2026-09-01") },
        NOW,
      ),
    ).toEqual({ label: "Registered", tone: "pending" })
  })

  it("gives an event dated today its full day before judging", () => {
    // Event dates are UTC midnight, so a direct comparison would read as "over"
    // from 08:00 Manila onward on the day it is actually running.
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "OneTime", endDate: utc("2026-08-10") },
        NOW,
      ).tone,
    ).toBe("pending")
  })
})

describe("resolveRegistrationAttendance — MultiDay", () => {
  it("counts occurrence check-ins rather than attendedAt (the reported bug)", () => {
    expect(
      resolveRegistrationAttendance(
        {
          eventType: "MultiDay",
          endDate: utc("2026-07-05"),
          attendedAt: null,
          attendedCount: 3,
          occurrenceCount: 5,
        },
        NOW,
      ),
    ).toEqual({ label: "3 of 5 days", tone: "attended" })
  })

  it("marks a genuine no-show on a finished run absent", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "MultiDay", endDate: utc("2026-07-05"), occurrenceCount: 5 },
        NOW,
      ),
    ).toEqual({ label: "Absent", tone: "absent" })
  })

  it("shows an upcoming multi-day run as registered", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "MultiDay", endDate: utc("2026-09-05"), occurrenceCount: 5 },
        NOW,
      ),
    ).toEqual({ label: "Registered", tone: "pending" })
  })

  it("never renders more days attended than exist", () => {
    // Standalone sessions can sit outside the event's day range.
    expect(
      resolveRegistrationAttendance(
        {
          eventType: "MultiDay",
          endDate: utc("2026-07-05"),
          attendedAt: null,
          attendedCount: 6,
          occurrenceCount: 5,
        },
        NOW,
      ).label,
    ).toBe("6 of 6 days")
  })

  it("falls back to a bare count when the event has no occurrences recorded", () => {
    expect(
      resolveRegistrationAttendance(
        {
          eventType: "MultiDay",
          endDate: utc("2026-07-05"),
          attendedAt: null,
          attendedCount: 1,
          occurrenceCount: 0,
        },
        NOW,
      ).label,
    ).toBe("1 of 1 days")
  })
})

describe("resolveRegistrationAttendance — Recurring", () => {
  it("reports the session count", () => {
    expect(
      resolveRegistrationAttendance(
        {
          eventType: "Recurring",
          endDate: utc("2026-07-05"),
          attendedAt: null,
          attendedCount: 12,
          occurrenceCount: 40,
        },
        NOW,
      ),
    ).toEqual({ label: "12 sessions", tone: "attended" })
  })

  it("singularises a lone session", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "Recurring", endDate: utc("2026-07-05"), attendedCount: 1 },
        NOW,
      ).label,
    ).toBe("1 session")
  })

  it("never says absent — an open-ended run has no single occasion to miss", () => {
    expect(
      resolveRegistrationAttendance(
        { ...base, eventType: "Recurring", endDate: utc("2026-01-05") },
        NOW,
      ),
    ).toEqual({ label: "No check-ins", tone: "pending" })
  })
})
