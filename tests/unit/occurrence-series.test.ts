import { describe, expect, it } from "vitest"
import { groupOccurrencesBySeries } from "@/lib/events/occurrence-series"

/**
 * Pure grouping/rollup maths. The DB-backed loader is covered in
 * tests/unit/series-summary.test.ts.
 */

const NOW = new Date("2026-08-14T00:00:00.000Z")

const RANGE = {
  id: "series-1",
  title: "Q3",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-09-30T00:00:00.000Z"),
}

function occurrence(
  date: string,
  attendeeCount: number,
  overrides: { hasCheckIns?: boolean } = {},
) {
  return {
    id: `occ-${date}`,
    date: new Date(`${date}T00:00:00.000Z`),
    isOpen: false,
    isStandalone: false,
    attendeeCount,
    seriesId: RANGE.id,
    ...overrides,
  }
}

describe("groupOccurrencesBySeries", () => {
  // Regression: the average divided by every session assigned to the series,
  // including ones still to come. A 12-week series four weeks in reported a
  // third of its real average, and contradicted the dashboard's own
  // "avg per session" KPI, which excludes future sessions.
  it("excludes sessions that have not happened from the average", () => {
    const { groups } = groupOccurrencesBySeries(
      [RANGE],
      [
        occurrence("2026-07-05", 50),
        occurrence("2026-07-12", 40),
        occurrence("2026-07-19", 60),
        occurrence("2026-08-23", 0),
        occurrence("2026-08-30", 0),
      ],
      NOW,
    )

    expect(groups[0].sessionCount).toBe(5)
    expect(groups[0].heldSessionCount).toBe(3)
    expect(groups[0].totalAttendance).toBe(150)
    expect(groups[0].averageAttendance).toBe(50)
  })

  it("keeps held sessions that drew nobody in the denominator", () => {
    const { groups } = groupOccurrencesBySeries(
      [RANGE],
      [occurrence("2026-07-05", 30), occurrence("2026-07-12", 0)],
      NOW,
    )

    expect(groups[0].heldSessionCount).toBe(2)
    expect(groups[0].averageAttendance).toBe(15)
  })

  // A session dated with today's Manila date sits a UTC day ahead until 08:00 PH,
  // so "future" sessions routinely hold real check-ins.
  it("counts a future-dated session as held once someone checks in", () => {
    const { groups } = groupOccurrencesBySeries(
      [RANGE],
      [occurrence("2026-08-15", 12)],
      NOW,
    )

    expect(groups[0].heldSessionCount).toBe(1)
    expect(groups[0].averageAttendance).toBe(12)
  })

  // Participants-only callers must be able to say "held" for a session whose
  // only check-ins are volunteers.
  it("honours an explicit hasCheckIns over the attendee count", () => {
    const { groups } = groupOccurrencesBySeries(
      [RANGE],
      [occurrence("2026-08-15", 0, { hasCheckIns: true })],
      NOW,
    )

    expect(groups[0].heldSessionCount).toBe(1)
    expect(groups[0].averageAttendance).toBe(0)
  })

  it("reports a wholly upcoming series as zero rather than dividing by zero", () => {
    const { groups } = groupOccurrencesBySeries(
      [RANGE],
      [occurrence("2026-08-23", 0), occurrence("2026-08-30", 0)],
      NOW,
    )

    expect(groups[0].sessionCount).toBe(2)
    expect(groups[0].heldSessionCount).toBe(0)
    expect(groups[0].averageAttendance).toBe(0)
  })

  it("counts today's session as held", () => {
    const { groups } = groupOccurrencesBySeries([RANGE], [occurrence("2026-08-14", 0)], NOW)

    expect(groups[0].heldSessionCount).toBe(1)
  })
})
