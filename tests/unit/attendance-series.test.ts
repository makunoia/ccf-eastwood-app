import { describe, expect, it } from "vitest"
import { buildAttendanceSeries } from "@/lib/events/attendance-series"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const OCCURRENCES = [
  { occurrenceId: "o2", date: day("2026-07-08"), attendees: 40 },
  { occurrenceId: "o1", date: day("2026-07-01"), attendees: 60 },
  { occurrenceId: "o3", date: day("2026-07-15"), attendees: 50 },
]

describe("buildAttendanceSeries", () => {
  it("orders points chronologically regardless of input order", () => {
    const { points } = buildAttendanceSeries(OCCURRENCES)
    expect(points.map((p) => p.date)).toEqual([
      "2026-07-01T00:00:00.000Z",
      "2026-07-08T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
    ])
  })

  it("totals participant check-ins and averages over the sessions present", () => {
    const series = buildAttendanceSeries(OCCURRENCES)
    expect(series.totalAttendees).toBe(150)
    expect(series.sessionCount).toBe(3)
    expect(series.averageAttendance).toBe(50)
  })

  it("keeps the participant series free of volunteer check-ins", () => {
    const series = buildAttendanceSeries(
      OCCURRENCES,
      new Map([
        ["o1", 5],
        ["o2", 3],
        ["o3", 4],
      ]),
    )

    expect(series.points.map((p) => p.attendees)).toEqual([60, 40, 50])
    expect(series.totalAttendees).toBe(150)
    expect(series.totalVolunteers).toBe(12)
  })

  // The Sessions page badge counts every check-in. This is the arithmetic that
  // makes the two screens reconcile instead of appearing to contradict.
  it("exposes participants + volunteers as the Sessions-page figure", () => {
    const { points } = buildAttendanceSeries(OCCURRENCES, new Map([["o1", 5]]))
    const firstSession = points[0]

    expect(firstSession.attendees).toBe(60)
    expect(firstSession.volunteers).toBe(5)
    expect(firstSession.totalCheckIns).toBe(65)
  })

  describe("edge cases", () => {
    it("returns a zeroed series when there are no sessions", () => {
      const series = buildAttendanceSeries([])
      expect(series.points).toEqual([])
      expect(series.totalAttendees).toBe(0)
      expect(series.sessionCount).toBe(0)
      expect(series.averageAttendance).toBe(0)
    })

    it("treats an occurrence with no volunteer row as zero volunteers", () => {
      const { points, totalVolunteers } = buildAttendanceSeries(OCCURRENCES, new Map())
      expect(points.every((p) => p.volunteers === 0)).toBe(true)
      expect(totalVolunteers).toBe(0)
    })

    it("keeps a session nobody attended in the average denominator", () => {
      const series = buildAttendanceSeries([
        { occurrenceId: "a", date: day("2026-07-01"), attendees: 60 },
        { occurrenceId: "b", date: day("2026-07-08"), attendees: 0 },
      ])
      expect(series.averageAttendance).toBe(30)
    })

    it("does not mutate the caller's occurrence array", () => {
      const input = [...OCCURRENCES]
      buildAttendanceSeries(input)
      expect(input.map((o) => o.occurrenceId)).toEqual(["o2", "o1", "o3"])
    })
  })
})
