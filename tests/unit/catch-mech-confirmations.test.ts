import { describe, it, expect } from "vitest"

import {
  applyDeclineReasons,
  resolveTargets,
  validateDecisions,
  validateTargets,
  type ConfirmDecision,
} from "@/lib/catch-mech/confirmations"

/**
 * These three were private to app/events/[id]/catch-mech/actions.ts, which put them
 * behind a `"use server"` boundary and out of reach of a unit test. They moved to
 * lib/ alongside prefetchRegistrantData and resolveConfirmations — those two were
 * *exported* from that boundary, which made prefetchRegistrantData a publicly
 * callable endpoint returning guest emails, phones and notes for any registrant id.
 */

const g = (id: string) => ({ id, name: id })

describe("validateDecisions", () => {
  it("accepts confirms and pendings without a reason", () => {
    const decisions: ConfirmDecision[] = [
      { registrantId: "a", status: "confirmed" },
      { registrantId: "b", status: "pending" },
    ]
    expect(validateDecisions(decisions)).toBeNull()
  })

  it("requires a decline reason on every declined member", () => {
    expect(validateDecisions([{ registrantId: "a", status: "declined" }])).toMatch(
      /decline reason is required/i
    )
  })

  it("rejects a decline reason that is not a known enum value", () => {
    const decisions = [
      { registrantId: "a", status: "declined", declineReason: "MadeItUp" },
    ] as unknown as ConfirmDecision[]
    expect(validateDecisions(decisions)).toMatch(/decline reason is required/i)
  })

  it("requires free text when the reason is Others", () => {
    expect(
      validateDecisions([
        { registrantId: "a", status: "declined", declineReason: "Others" },
      ])
    ).toMatch(/specify the reason/i)
  })

  it("treats whitespace-only Others text as missing", () => {
    expect(
      validateDecisions([
        { registrantId: "a", status: "declined", declineReason: "Others", reason: "   " },
      ])
    ).toMatch(/specify the reason/i)
  })

  it("accepts Others with real text", () => {
    expect(
      validateDecisions([
        { registrantId: "a", status: "declined", declineReason: "Others", reason: "moving away" },
      ])
    ).toBeNull()
  })

  it("accepts an empty submission — a faci deferring everyone still answered", () => {
    expect(validateDecisions([])).toBeNull()
  })
})

describe("validateTargets", () => {
  const two = [g("g1"), g("g2")]

  it("skips the check entirely with one candidate — the picker never renders", () => {
    expect(
      validateTargets([{ registrantId: "a", status: "confirmed" }], [g("g1")])
    ).toBeNull()
  })

  it("skips the check with no candidates — a Timothy names a group first", () => {
    expect(validateTargets([{ registrantId: "a", status: "confirmed" }], [])).toBeNull()
  })

  it("demands a destination per confirm when the faci leads several groups", () => {
    expect(validateTargets([{ registrantId: "a", status: "confirmed" }], two)).toMatch(
      /choose which dgroup/i
    )
  })

  it("rejects a destination the faci does not lead", () => {
    expect(
      validateTargets(
        [{ registrantId: "a", status: "confirmed", targetGroupId: "someone-elses" }],
        two
      )
    ).toMatch(/only confirm people into a dgroup you lead/i)
  })

  it("ignores targets on declines and pendings", () => {
    expect(
      validateTargets(
        [
          { registrantId: "a", status: "declined", declineReason: "NotInterested" },
          { registrantId: "b", status: "pending" },
        ],
        two
      )
    ).toBeNull()
  })

  it("accepts a valid per-person destination", () => {
    expect(
      validateTargets([{ registrantId: "a", status: "confirmed", targetGroupId: "g2" }], two)
    ).toBeNull()
  })
})

describe("resolveTargets", () => {
  it("defaults a confirm to the first candidate when no target was picked", () => {
    const [row] = resolveTargets(
      [{ registrantId: "a", status: "confirmed" }],
      [g("linked"), g("other")],
      "linked"
    )
    expect(row.groupId).toBe("linked")
  })

  it("honours an explicit target over the default", () => {
    const [row] = resolveTargets(
      [{ registrantId: "a", status: "confirmed", targetGroupId: "other" }],
      [g("linked"), g("other")],
      "linked"
    )
    expect(row.groupId).toBe("other")
  })

  it("hangs a decline on the decline group, not the confirm default", () => {
    const [row] = resolveTargets(
      [{ registrantId: "a", status: "declined", declineReason: "NotInterested" }],
      [g("linked"), g("other")],
      "decline-home"
    )
    expect(row.groupId).toBe("decline-home")
  })

  it("leaves a pending groupless so resolveConfirmations skips it", () => {
    const [row] = resolveTargets([{ registrantId: "a", status: "pending" }], [g("linked")], "linked")
    expect(row.groupId).toBeNull()
  })

  it("yields a null group for a confirm with no candidates at all", () => {
    const [row] = resolveTargets([{ registrantId: "a", status: "confirmed" }], [], null)
    expect(row.groupId).toBeNull()
  })

  it("preserves the decline reason and note alongside the resolved group", () => {
    const [row] = resolveTargets(
      [{ registrantId: "a", status: "declined", declineReason: "Others", reason: "moving" }],
      [g("linked")],
      "linked"
    )
    expect(row).toMatchObject({ declineReason: "Others", reason: "moving", groupId: "linked" })
  })
})

/**
 * The decline-reason step walks declined people one at a time and now has a Back
 * button, so an answer can be revisited and changed before submit. That only means
 * anything if the *final* merge reads the reasons map as it stands at submit time
 * rather than baking in each answer when it was first picked.
 */
describe("applyDeclineReasons", () => {
  const staged: ConfirmDecision[] = [
    { registrantId: "keep", status: "confirmed" },
    { registrantId: "skip", status: "pending" },
    { registrantId: "drop", status: "declined" },
  ]

  it("attaches the collected reason to the declined row only", () => {
    const merged = applyDeclineReasons(staged, {
      drop: { declineReason: "NotInterested" },
    })
    expect(merged[0]).toEqual({ registrantId: "keep", status: "confirmed" })
    expect(merged[1]).toEqual({ registrantId: "skip", status: "pending" })
    expect(merged[2]).toMatchObject({ status: "declined", declineReason: "NotInterested" })
  })

  it("carries the free-text note for Others", () => {
    const merged = applyDeclineReasons(staged, {
      drop: { declineReason: "Others", note: "moved abroad" },
    })
    expect(merged[2]).toMatchObject({ declineReason: "Others", reason: "moved abroad" })
  })

  it("uses the latest answer when Back was used to change one", () => {
    // First pass picked Unresponsive; the faci stepped back and chose Others.
    const merged = applyDeclineReasons(staged, {
      drop: { declineReason: "Others", note: "already in a group" },
    })
    expect(merged[2]).toMatchObject({ declineReason: "Others", reason: "already in a group" })
    expect(merged[2].declineReason).not.toBe("Unresponsive")
  })

  it("clears a stale note when the reason moves off Others", () => {
    // Stepping back from Others to a fixed reason must not leave the old free text
    // attached — validateDecisions would pass it straight through to the DB.
    const merged = applyDeclineReasons(staged, {
      drop: { declineReason: "Unresponsive" },
    })
    expect(merged[2].reason).toBeUndefined()
  })

  it("leaves a declined row unreasoned when nothing was collected — validation then rejects it", () => {
    const merged = applyDeclineReasons(staged, {})
    expect(merged[2].declineReason).toBeUndefined()
    expect(validateDecisions(merged)).toMatch(/decline reason is required/i)
  })

  it("ignores reasons collected for someone no longer declined", () => {
    // The faci went Back to the list and flipped "drop" to Confirm before resubmitting.
    const restaged: ConfirmDecision[] = [{ registrantId: "drop", status: "confirmed" }]
    const merged = applyDeclineReasons(restaged, { drop: { declineReason: "NotInterested" } })
    expect(merged[0]).toEqual({ registrantId: "drop", status: "confirmed" })
    expect(merged[0]).not.toHaveProperty("declineReason")
  })

  it("does not mutate the staged decisions", () => {
    const original = structuredClone(staged)
    applyDeclineReasons(staged, { drop: { declineReason: "NotInterested" } })
    expect(staged).toEqual(original)
  })
})
