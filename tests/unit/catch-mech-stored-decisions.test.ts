import { describe, expect, it } from "vitest"
import { readStoredDecisions } from "@/lib/catch-mech/stored-decisions"

/**
 * `ConfirmationSubmission.decisions` is untyped JSON written by three different
 * flows, so the admin pages' reader has to survive anything already in the
 * column. These pin that contract.
 */
describe("readStoredDecisions", () => {
  it("reads confirmed placements with their destination group", () => {
    expect(
      readStoredDecisions([
        { registrantId: "r1", status: "confirmed", targetGroupId: "g1" },
        { registrantId: "r2", status: "confirmed", targetGroupId: "g2" },
      ])
    ).toEqual([
      { registrantId: "r1", status: "confirmed", smallGroupId: "g1", declineReason: null },
      { registrantId: "r2", status: "confirmed", smallGroupId: "g2", declineReason: null },
    ])
  })

  it("keeps declines and deferrals rather than dropping them", () => {
    expect(
      readStoredDecisions([
        { registrantId: "r1", status: "declined", declineReason: "NotInterested" },
        { registrantId: "r2", status: "pending" },
        { registrantId: "r3", status: "confirmed", targetGroupId: "g1" },
      ])
    ).toEqual([
      {
        registrantId: "r1",
        status: "declined",
        smallGroupId: null,
        declineReason: "Not Interested",
      },
      { registrantId: "r2", status: "deferred", smallGroupId: null, declineReason: null },
      { registrantId: "r3", status: "confirmed", smallGroupId: "g1", declineReason: null },
    ])
  })

  it("spells out an Others decline with its free text", () => {
    expect(
      readStoredDecisions([
        { registrantId: "r1", status: "declined", declineReason: "Others", reason: "Moved abroad" },
      ])[0].declineReason
    ).toBe("Others — Moved abroad")
  })

  it("falls back to no reason when a decline recorded none", () => {
    expect(
      readStoredDecisions([{ registrantId: "r1", status: "declined" }])[0].declineReason
    ).toBeNull()
  })

  it("treats the leader form's 'rejected' as a decline", () => {
    expect(readStoredDecisions([{ registrantId: "r1", status: "rejected" }])[0].status).toBe(
      "declined"
    )
  })

  it("ignores a reason attached to a confirm", () => {
    expect(
      readStoredDecisions([
        { registrantId: "r1", status: "confirmed", declineReason: "NotInterested" },
      ])[0].declineReason
    ).toBeNull()
  })

  it("ignores a decline reason that is not a known enum value", () => {
    expect(
      readStoredDecisions([
        { registrantId: "r1", status: "declined", declineReason: "MadeThisUp" },
      ])[0].declineReason
    ).toBeNull()
  })

  it("keeps a confirm whose target group was never recorded", () => {
    expect(readStoredDecisions([{ registrantId: "r1", status: "confirmed" }])).toEqual([
      { registrantId: "r1", status: "confirmed", smallGroupId: null, declineReason: null },
    ])
  })

  it("returns nothing for a payload that is not an array of decisions", () => {
    expect(readStoredDecisions(null)).toEqual([])
    expect(readStoredDecisions(undefined)).toEqual([])
    expect(readStoredDecisions({})).toEqual([])
    expect(readStoredDecisions("[]")).toEqual([])
  })

  it("skips malformed entries instead of failing the whole page", () => {
    expect(
      readStoredDecisions([
        null,
        "nope",
        { status: "confirmed" },
        { registrantId: 42, status: "confirmed" },
        { registrantId: "r1", status: "confirmed", targetGroupId: 7 },
      ])
    ).toEqual([
      { registrantId: "r1", status: "confirmed", smallGroupId: null, declineReason: null },
    ])
  })
})
