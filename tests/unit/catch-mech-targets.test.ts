import { describe, it, expect } from "vitest"
import {
  resolveCatchMechTargets,
  type CatchMechSessionShape,
} from "@/lib/catch-mech/targets"

const groupA = { id: "ga", name: "Makati East Cell" }
const groupB = { id: "gb", name: "BGC Young Pros" }
const linked = { id: "gl", name: "Linked Group" }

function session(over: Partial<{
  facilitatorVolunteerId: string
  breakoutFacilitatorId: string | null
  linkedSmallGroup: { id: string; name: string } | null
  ledGroups: { id: string; name: string }[]
}> = {}): CatchMechSessionShape {
  // Keep the historical field in the runtime row to prove the resolver ignores it.
  const breakoutGroup = {
    facilitatorId: over.breakoutFacilitatorId === undefined ? "v1" : over.breakoutFacilitatorId,
    linkedSmallGroup: over.linkedSmallGroup ?? null,
  }
  return {
    facilitatorVolunteerId: over.facilitatorVolunteerId ?? "v1",
    breakoutGroup,
    facilitator: { member: { ledGroups: over.ledGroups ?? [] } },
  }
}

describe("resolveCatchMechTargets", () => {
  it("offers no candidates for a Timothy who leads nothing and has no link", () => {
    const t = resolveCatchMechTargets(session())
    expect(t.candidates).toEqual([])
    // The one case where a decline has no group to hang on.
    expect(t.declineGroupId).toBeNull()
  })

  it("offers the single led group with no link", () => {
    const t = resolveCatchMechTargets(session({ ledGroups: [groupA] }))
    expect(t.candidates).toEqual([groupA])
    expect(t.declineGroupId).toBe(groupA.id)
  })

  it("offers every led group when the faci leads several", () => {
    const t = resolveCatchMechTargets(session({ ledGroups: [groupA, groupB] }))
    expect(t.candidates).toEqual([groupA, groupB])
    // Declines are never picked for — they fall back to the earliest group.
    expect(t.declineGroupId).toBe(groupA.id)
  })

  it("does not reorder a facilitator's DGroups around a legacy breakout link", () => {
    const t = resolveCatchMechTargets(
      session({ ledGroups: [groupA, groupB], linkedSmallGroup: groupB })
    )
    expect(t.candidates).toEqual([groupA, groupB])
    expect(t.declineGroupId).toBe(groupA.id)
  })

  it("never offers a legacy linked group that the facilitator does not lead", () => {
    const t = resolveCatchMechTargets(
      session({ ledGroups: [groupA], linkedSmallGroup: linked })
    )
    expect(t.candidates).toEqual([groupA])
    expect(t.declineGroupId).toBe(groupA.id)
  })

  it("keeps a facilitator without DGroups on the Timothy path despite a legacy link", () => {
    const t = resolveCatchMechTargets(session({ linkedSmallGroup: linked }))
    expect(t.candidates).toEqual([])
    expect(t.declineGroupId).toBeNull()
  })

  it("ignores the link for a co-faci — they absorb into their own group", () => {
    const t = resolveCatchMechTargets(
      session({
        facilitatorVolunteerId: "v2",
        breakoutFacilitatorId: "v1",
        linkedSmallGroup: linked,
        ledGroups: [groupA],
      })
    )
    expect(t.candidates).toEqual([groupA])
    expect(t.declineGroupId).toBe(groupA.id)
  })

  it("leaves a co-faci who leads nothing as a Timothy despite the link", () => {
    const t = resolveCatchMechTargets(
      session({
        facilitatorVolunteerId: "v2",
        breakoutFacilitatorId: "v1",
        linkedSmallGroup: linked,
        ledGroups: [],
      })
    )
    expect(t.candidates).toEqual([])
    expect(t.declineGroupId).toBeNull()
  })
})
