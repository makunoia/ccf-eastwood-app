import { describe, expect, it } from "vitest"
import { isOnClusterDay, type ClusterDayScope } from "@/lib/clusters/roster"
import type { EventType } from "@/app/generated/prisma/client"

/**
 * A cluster is one day; a Recurring/MultiDay event's registrations are not.
 * `isOnClusterDay` is the rule that keeps the day's figures about the day.
 */

const scope: ClusterDayScope = {
  clusterId: "cluster-1",
  date: new Date("2026-08-02T00:00:00Z"),
}

function row(
  eventType: EventType,
  overrides: {
    checkedIn?: boolean
    registrationClusterId?: string | null
    hasLinkedSession?: boolean
  } = {}
) {
  return {
    eventType,
    checkedIn: overrides.checkedIn ?? false,
    registrationClusterId: overrides.registrationClusterId ?? null,
    hasLinkedSession: overrides.hasLinkedSession ?? false,
  }
}

describe("isOnClusterDay", () => {
  it("counts every registration for a OneTime event — they are the day", () => {
    expect(isOnClusterDay(row("OneTime"), scope)).toBe(true)
  })

  it("counts a session registrant who checked in on the day", () => {
    expect(isOnClusterDay(row("Recurring", { checkedIn: true }), scope)).toBe(true)
    expect(isOnClusterDay(row("MultiDay", { checkedIn: true }), scope)).toBe(true)
  })

  it("counts a session registrant who signed up through this day's link", () => {
    expect(
      isOnClusterDay(row("Recurring", { registrationClusterId: "cluster-1" }), scope)
    ).toBe(true)
  })

  it("excludes a standing series registrant with no evidence for the day", () => {
    // The whole point: someone who registered for the weekly service months ago
    // and isn't here today is not part of today's figures.
    expect(isOnClusterDay(row("Recurring"), scope)).toBe(false)
  })

  it("excludes a registration stamped by a different cluster", () => {
    expect(
      isOnClusterDay(row("Recurring", { registrationClusterId: "cluster-2" }), scope)
    ).toBe(false)
  })

  it("counts everything when the cluster has no date to scope to", () => {
    const dateless: ClusterDayScope = { clusterId: "cluster-1", date: null }
    expect(isOnClusterDay(row("Recurring"), dateless)).toBe(true)
    expect(isOnClusterDay(row("Recurring"), null)).toBe(true)
  })

  it("scopes by the linked session even when the cluster has no date", () => {
    // Picking a session is itself a scope: the admin said which session this day
    // is, so a standing registrant with no attendance is not part of it.
    const dateless: ClusterDayScope = { clusterId: "cluster-1", date: null }
    expect(isOnClusterDay(row("Recurring", { hasLinkedSession: true }), dateless)).toBe(
      false
    )
    expect(
      isOnClusterDay(
        row("Recurring", { hasLinkedSession: true, checkedIn: true }),
        dateless
      )
    ).toBe(true)
  })
})
