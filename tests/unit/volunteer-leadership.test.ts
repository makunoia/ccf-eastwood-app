import { describe, it, expect } from "vitest"
import {
  LEADERSHIP_OPTIONS,
  memberGroupStatusFor,
  newGroupStatusFor,
  resolveEffectiveLeadership,
  resolveInitialLeadership,
  shouldActivateGroup,
} from "@/lib/volunteers/leadership"

describe("LEADERSHIP_OPTIONS", () => {
  it("offers exactly the two leadership choices, with no opt-out", () => {
    expect(LEADERSHIP_OPTIONS.map((o) => o.value)).toEqual(["leader", "timothy"])
    expect(LEADERSHIP_OPTIONS.map((o) => o.label)).toEqual([
      "I lead a group",
      "I want to lead a group",
    ])
  })
})

describe("resolveInitialLeadership", () => {
  it("returns null when nothing is known — the form must ask", () => {
    expect(resolveInitialLeadership({ groupStatus: null, ledGroups: [] })).toBeNull()
  })

  it("returns null for a plain group member who leads nothing", () => {
    expect(resolveInitialLeadership({ groupStatus: "Member", ledGroups: [] })).toBeNull()
  })

  it("treats a declared Leader as a leader", () => {
    expect(resolveInitialLeadership({ groupStatus: "Leader", ledGroups: [] })).toBe("leader")
  })

  it("treats a declared Timothy with no group as a timothy", () => {
    expect(resolveInitialLeadership({ groupStatus: "Timothy", ledGroups: [] })).toBe("timothy")
  })

  it("keeps a Timothy whose intended group is still Pending as a timothy", () => {
    expect(
      resolveInitialLeadership({ groupStatus: "Timothy", ledGroups: [{ status: "Pending" }] })
    ).toBe("timothy")
  })

  // Regression: an Active group is proof of real leadership and must outrank a
  // stale groupStatus, which most activation paths never promote.
  it("promotes a Timothy whose group has since gone Active to leader", () => {
    expect(
      resolveInitialLeadership({ groupStatus: "Timothy", ledGroups: [{ status: "Active" }] })
    ).toBe("leader")
  })

  it("promotes when any one of several led groups is Active", () => {
    expect(
      resolveInitialLeadership({
        groupStatus: "Timothy",
        ledGroups: [{ status: "Pending" }, { status: "Active" }],
      })
    ).toBe("leader")
  })

  it("falls back to timothy for a led group that is neither Active nor owned by a known status", () => {
    expect(resolveInitialLeadership({ groupStatus: null, ledGroups: [{ status: "Pending" }] })).toBe(
      "timothy"
    )
  })

  it("does not treat an Inactive group as proof of leadership", () => {
    expect(
      resolveInitialLeadership({ groupStatus: null, ledGroups: [{ status: "Inactive" }] })
    ).toBe("timothy")
  })
})

describe("resolveEffectiveLeadership", () => {
  it("upgrades a timothy submission against an Active group", () => {
    expect(resolveEffectiveLeadership("timothy", "Active")).toBe("leader")
  })

  it("leaves a timothy submission against a Pending group alone", () => {
    expect(resolveEffectiveLeadership("timothy", "Pending")).toBe("timothy")
  })

  it("leaves a timothy submission with no existing group alone", () => {
    expect(resolveEffectiveLeadership("timothy", null)).toBe("timothy")
  })

  it("never downgrades a declared leader", () => {
    expect(resolveEffectiveLeadership("leader", "Pending")).toBe("leader")
    expect(resolveEffectiveLeadership("leader", "Active")).toBe("leader")
  })

  it("leaves 'none' untouched even against an Active group", () => {
    expect(resolveEffectiveLeadership("none", "Active")).toBe("none")
  })
})

describe("memberGroupStatusFor", () => {
  it("maps leadership onto Member.groupStatus", () => {
    expect(memberGroupStatusFor("leader")).toBe("Leader")
    expect(memberGroupStatusFor("timothy")).toBe("Timothy")
  })

  it("returns null for 'none' so the field is left alone", () => {
    expect(memberGroupStatusFor("none")).toBeNull()
  })
})

describe("newGroupStatusFor", () => {
  it("makes a leader's group live immediately", () => {
    expect(newGroupStatusFor("leader")).toBe("Active")
  })

  it("holds a Timothy's intended group until its first member", () => {
    expect(newGroupStatusFor("timothy")).toBe("Pending")
  })
})

describe("shouldActivateGroup", () => {
  it("activates a Pending group when leadership is claimed", () => {
    expect(shouldActivateGroup("leader", "Pending")).toBe(true)
  })

  it("does not touch an already Active group", () => {
    expect(shouldActivateGroup("leader", "Active")).toBe(false)
  })

  it("does not activate on a timothy submission", () => {
    expect(shouldActivateGroup("timothy", "Pending")).toBe(false)
  })

  it("does not resurrect an Inactive group", () => {
    expect(shouldActivateGroup("leader", "Inactive")).toBe(false)
  })
})
