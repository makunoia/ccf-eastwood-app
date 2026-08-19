import { describe, expect, it } from "vitest"
import { ClusterKind } from "@/app/generated/prisma/client"
import { catchMechScopeFor } from "@/lib/catch-mech/scope"
import { staffVolunteerFor } from "@/lib/catch-mech/faci-session"
import type { PoolScope } from "@/lib/events/pool-scope"

/**
 * Catch Mech stays an event-level feature. Under a Collab the day's tables belong
 * to the cluster, so a bare `eventId` finds only the event's standing tables —
 * which nobody sat at. The bridge is the facilitator: `Volunteer.eventId` is
 * required, so whoever runs a table belongs to exactly one ministry event.
 */
function poolScope(overrides: Partial<PoolScope> = {}): PoolScope {
  return {
    eventId: "event-a",
    clusterId: null,
    clusterName: null,
    kind: null,
    volunteerEventIds: ["event-a"],
    breakoutOwner: { eventId: "event-a" },
    candidateEventIds: ["event-a"],
    ...overrides,
  }
}

describe("catchMechScopeFor", () => {
  it("scopes a plain event to its own tables", () => {
    const scope = catchMechScopeFor(poolScope())

    expect(scope.where).toEqual({ eventId: "event-a" })
    expect(scope.viaCluster).toBe(false)
    expect(scope.owner).toEqual({ eventId: "event-a" })
  })

  it("treats a Parallel cluster exactly like no cluster", () => {
    // A Parallel day is several independent events sharing a date; each still
    // runs its own tables.
    const scope = catchMechScopeFor(
      poolScope({
        kind: ClusterKind.Parallel,
        clusterId: "cluster-1",
        clusterName: "Sunday",
        breakoutOwner: { eventId: "event-a" },
      })
    )

    expect(scope.where).toEqual({ eventId: "event-a" })
    expect(scope.viaCluster).toBe(false)
  })

  it("endorses a Collab's cluster tables through whoever staffs them", () => {
    const scope = catchMechScopeFor(
      poolScope({
        kind: ClusterKind.Collab,
        clusterId: "cluster-1",
        clusterName: "Youth x Singles",
        volunteerEventIds: ["event-a", "event-b"],
        breakoutOwner: { clusterId: "cluster-1" },
        candidateEventIds: ["event-a", "event-b"],
      })
    )

    expect(scope.viaCluster).toBe(true)
    expect(scope.clusterName).toBe("Youth x Singles")
    // The owner stays cluster-wide — it answers "who is seated nowhere today",
    // which is not the same question as "which tables are mine".
    expect(scope.owner).toEqual({ clusterId: "cluster-1" })
    expect(scope.where).toEqual({
      clusterId: "cluster-1",
      OR: [
        { facilitator: { eventId: "event-a" } },
        { coFacilitator: { eventId: "event-a" } },
        { subFacilitators: { some: { substitute: { eventId: "event-a" } } } },
      ],
    })
  })
})

describe("staffVolunteerFor", () => {
  const lead = { id: "v-lead", memberId: "m1" }
  const co = { id: "v-co", memberId: "m2" }
  const sub = { id: "v-sub", memberId: "m3" }
  const group = { facilitator: lead, coFacilitator: co, subFacilitators: [{ substitute: sub }] }

  it("resolves each role to its own volunteer row", () => {
    expect(staffVolunteerFor(group, "m1")).toEqual(lead)
    expect(staffVolunteerFor(group, "m2")).toEqual(co)
    expect(staffVolunteerFor(group, "m3")).toEqual(sub)
  })

  it("returns null for someone who staffs nothing", () => {
    expect(staffVolunteerFor(group, "m9")).toBeNull()
  })

  it("prefers the lead role when one person holds two", () => {
    // The lead owns the table's linked DGroup in resolveCatchMechTargets, so
    // someone substituting on a table they also lead must act as the lead.
    const doubled = {
      facilitator: lead,
      coFacilitator: null,
      subFacilitators: [{ substitute: { id: "v-sub2", memberId: "m1" } }],
    }
    expect(staffVolunteerFor(doubled, "m1")).toEqual(lead)
  })

  it("does not match a table with no staff at all", () => {
    expect(
      staffVolunteerFor({ facilitator: null, coFacilitator: null, subFacilitators: [] }, "m1")
    ).toBeNull()
  })
})
