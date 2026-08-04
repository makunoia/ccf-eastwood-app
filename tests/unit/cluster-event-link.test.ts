import { describe, expect, it } from "vitest"
import {
  isSameUtcDay,
  validateClusterEventLink,
} from "@/lib/validations/event-cluster"

/**
 * Link rules for a cluster day: everything in it falls on the cluster's date, a
 * Recurring event joins through one named session, and MultiDay can't join.
 * Applied to new links and session changes only — never to existing links.
 */

const CLUSTER_DATE = new Date("2026-08-02T00:00:00Z")

function link(overrides: Partial<Parameters<typeof validateClusterEventLink>[0]> = {}) {
  return validateClusterEventLink({
    eventId: "event-1",
    eventName: "Sunday Service",
    eventType: "OneTime",
    eventStartDate: CLUSTER_DATE,
    clusterDate: CLUSTER_DATE,
    session: null,
    ...overrides,
  })
}

describe("isSameUtcDay", () => {
  it("matches bare UTC days and ignores the time of day", () => {
    expect(isSameUtcDay(CLUSTER_DATE, new Date("2026-08-02T23:59:59Z"))).toBe(true)
    expect(isSameUtcDay(CLUSTER_DATE, new Date("2026-08-03T00:00:00Z"))).toBe(false)
  })
})

describe("validateClusterEventLink", () => {
  it("rejects a multi-day event outright", () => {
    const result = link({ eventType: "MultiDay", eventName: "Camp" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("multi-day")
  })

  it("accepts a one-time event on the cluster's date", () => {
    expect(link()).toEqual({ ok: true })
  })

  it("rejects a one-time event on another date", () => {
    const result = link({ eventStartDate: new Date("2026-08-09T00:00:00Z") })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("isn't on this cluster's date")
  })

  it("rejects a session on a one-time event — it has none to pick", () => {
    const result = link({
      session: { id: "occ-1", eventId: "event-1", date: CLUSTER_DATE },
    })
    expect(result.ok).toBe(false)
  })

  it("requires a session for a recurring event", () => {
    const result = link({ eventType: "Recurring", session: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("Pick which session")
  })

  it("accepts a recurring event whose session falls on the cluster's date", () => {
    expect(
      link({
        eventType: "Recurring",
        session: { id: "occ-1", eventId: "event-1", date: CLUSTER_DATE },
      })
    ).toEqual({ ok: true })
  })

  it("rejects a session belonging to a different event", () => {
    const result = link({
      eventType: "Recurring",
      session: { id: "occ-1", eventId: "other-event", date: CLUSTER_DATE },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("doesn't belong to")
  })

  it("rejects a session on a different date from the cluster", () => {
    const result = link({
      eventType: "Recurring",
      session: {
        id: "occ-1",
        eventId: "event-1",
        date: new Date("2026-07-26T00:00:00Z"),
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("isn't on this cluster's date")
  })

  it("edge case — a dateless cluster skips the date checks but still needs a session", () => {
    expect(
      link({
        clusterDate: null,
        eventType: "Recurring",
        session: {
          id: "occ-1",
          eventId: "event-1",
          date: new Date("2026-07-26T00:00:00Z"),
        },
      })
    ).toEqual({ ok: true })
    expect(
      link({ clusterDate: null, eventStartDate: new Date("2026-01-01T00:00:00Z") })
    ).toEqual({ ok: true })
    expect(link({ clusterDate: null, eventType: "Recurring", session: null }).ok).toBe(
      false
    )
  })
})
