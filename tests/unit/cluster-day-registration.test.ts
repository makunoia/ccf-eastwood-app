import { describe, expect, it } from "vitest"

import {
  clusterDayAttendedAt,
  clusterDayRegistrationDisposition,
} from "@/lib/clusters/day-registration"

/**
 * What an existing `EventRegistrant` row means when someone submits a cluster's
 * shared form.
 *
 * The rule this pins: a **Collab** day owns its registrant list, so it starts
 * fresh. A row on one of the member events — which is one row per person per
 * event *series*, and so predates the day for every regular of either ministry —
 * is not a registration for the day, and must not short-circuit the submission.
 * A **Parallel** day is the opposite: the person ticked that event, so its own
 * registration is exactly the thing being asked about.
 */

const CLUSTER = "cluster-1"

describe("clusterDayRegistrationDisposition", () => {
  it("creates when the person holds no registration on the event", () => {
    expect(clusterDayRegistrationDisposition(true, null, CLUSTER)).toBe("create")
    expect(clusterDayRegistrationDisposition(false, null, CLUSTER)).toBe("create")
  })

  it("reuses a Collab member event's pre-existing row rather than counting it", () => {
    // The Youth regular: a row made long before this day existed.
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: null }, CLUSTER)
    ).toBe("reuse")
  })

  it("reuses a row stamped for a different day", () => {
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: "cluster-2" }, CLUSTER)
    ).toBe("reuse")
  })

  it("stops at already once the row belongs to this day", () => {
    // Idempotence: submitting the collab form twice must not re-file placement.
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: CLUSTER }, CLUSTER)
    ).toBe("already")
  })

  it("leaves a Parallel day reading any existing registration as already", () => {
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: null }, CLUSTER)
    ).toBe("already")
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: CLUSTER }, CLUSTER)
    ).toBe("already")
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: "cluster-2" }, CLUSTER)
    ).toBe("already")
  })
})

/**
 * Attendance on a Collab day's breakout detail screen.
 *
 * The table seats people from either ministry's event, and the two record
 * check-in differently — `attendedAt` on a OneTime, an occurrence row on a
 * session event. The regression this pins is the unscoped read: a weekly
 * event's regular has attendance rows going back months, and counting any of
 * them would show them as present at today's table before they walked in.
 */
describe("clusterDayAttendedAt", () => {
  const DAY = new Date("2026-08-21T00:00:00.000Z")

  function attendance(occurrenceId: string, date: string, checkedInAt = date) {
    return {
      occurrenceId,
      checkedInAt: new Date(checkedInAt),
      occurrence: { date: new Date(date) },
    }
  }

  it("takes a OneTime member event's own check-in", () => {
    const at = new Date("2026-08-21T02:00:00.000Z")
    expect(
      clusterDayAttendedAt(
        { attendedAt: at, occurrenceAttendances: [] },
        { date: DAY, linkedOccurrenceId: null }
      )
    ).toBe(at)
  })

  it("reads the session the cluster link names, ignoring every other sitting", () => {
    const rows = [
      attendance("occ-old", "2026-08-14T00:00:00.000Z"),
      attendance("occ-today", "2026-08-21T00:00:00.000Z", "2026-08-21T01:30:00.000Z"),
    ]
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: rows },
        { date: DAY, linkedOccurrenceId: "occ-today" }
      )
    ).toEqual(new Date("2026-08-21T01:30:00.000Z"))
  })

  it("falls back to the cluster date's occurrence when the link names no session", () => {
    const rows = [
      attendance("occ-old", "2026-08-14T00:00:00.000Z"),
      attendance("occ-today", "2026-08-21T00:00:00.000Z", "2026-08-21T01:30:00.000Z"),
    ]
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: rows },
        { date: DAY, linkedOccurrenceId: null }
      )
    ).toEqual(new Date("2026-08-21T01:30:00.000Z"))
  })

  it("does not count a past session as attendance for the day", () => {
    const rows = [attendance("occ-old", "2026-08-14T00:00:00.000Z")]
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: rows },
        { date: DAY, linkedOccurrenceId: null }
      )
    ).toBeNull()
    // And the linked-session reading is stricter still.
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: rows },
        { date: DAY, linkedOccurrenceId: "occ-today" }
      )
    ).toBeNull()
  })

  it("accepts any attendance on a dateless cluster — there is no day to window by", () => {
    const rows = [attendance("occ-old", "2026-08-14T00:00:00.000Z")]
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: rows },
        { date: null, linkedOccurrenceId: null }
      )
    ).toEqual(new Date("2026-08-14T00:00:00.000Z"))
  })

  it("is null when nobody checked in", () => {
    expect(
      clusterDayAttendedAt(
        { attendedAt: null, occurrenceAttendances: [] },
        { date: DAY, linkedOccurrenceId: null }
      )
    ).toBeNull()
  })
})
