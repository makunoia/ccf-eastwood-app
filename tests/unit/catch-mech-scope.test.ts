import { describe, expect, it } from "vitest"
import { ClusterKind } from "@/app/generated/prisma/client"
import { catchMechScopeFor } from "@/lib/catch-mech/scope"
import { staffVolunteerFor } from "@/lib/catch-mech/faci-session"
import type { PoolScope } from "@/lib/events/pool-scope"

/**
 * Catch Mech is event-only. Collab tables stay local to the collab workspace.
 */
function poolScope(overrides: Partial<PoolScope> = {}): PoolScope {
  return {
    eventId: "event-a",
    clusterId: null,
    clusterName: null,
    kind: null,
    volunteerEventIds: ["event-a"],
    breakoutOwner: { eventId: "event-a" },
    clusterBreakoutOwner: null,
    candidateEventIds: ["event-a"],
    ...overrides,
  }
}

describe("catchMechScopeFor", () => {
  it("scopes a plain event to its own tables", () => {
    const scope = catchMechScopeFor(poolScope())

    expect(scope.where).toEqual({ eventId: "event-a" })
    expect(scope.seatedWhere).toEqual({ eventId: "event-a" })
    expect(scope.viaCluster).toBe(false)
  })

  it("treats a Parallel cluster exactly like no cluster", () => {
    // A Parallel day is several independent events sharing a date; each still
    // runs its own tables.
    const scope = catchMechScopeFor(
      poolScope({
        kind: ClusterKind.Parallel,
        clusterId: "cluster-1",
        clusterName: "Sunday",
      })
    )

    expect(scope.where).toEqual({ eventId: "event-a" })
    expect(scope.seatedWhere).toEqual({ eventId: "event-a" })
    expect(scope.viaCluster).toBe(false)
  })

  it("does not expose a Collab's tables through an Event", () => {
    const scope = catchMechScopeFor(
      poolScope({
        kind: ClusterKind.Collab,
        clusterId: "cluster-1",
        clusterName: "Youth x Singles",
        volunteerEventIds: ["event-a", "event-b"],
        clusterBreakoutOwner: { clusterId: "cluster-1" },
        candidateEventIds: ["event-a", "event-b"],
      })
    )

    expect(scope.viaCluster).toBe(false)
    expect(scope.clusterName).toBeNull()
    expect(scope.where).toEqual({ eventId: "event-a" })
    expect(scope.seatedWhere).toEqual({ eventId: "event-a" })
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
