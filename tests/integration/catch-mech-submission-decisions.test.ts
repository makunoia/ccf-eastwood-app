import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { resolveSubmissionDecisions } from "@/lib/catch-mech/submission-detail"

/**
 * The admin submissions pages used to show counts only. These pin the resolution
 * from a stored decisions blob back to the actual people and outcomes — the
 * confirm/decline detail both the facilitator and volunteer pages render.
 */
describe("resolveSubmissionDecisions", () => {
  beforeEach(async () => {
    await db.$executeRaw`
      TRUNCATE
        "ConfirmationSubmission", "EventRegistrant", "Guest",
        "SmallGroup", "Member", "Event"
      RESTART IDENTITY CASCADE
    `
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function seed() {
    const event = await db.event.create({
      data: {
        name: "Catch Mech Event",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
      },
    })
    const leader = await db.member.create({
      data: { firstName: "Ana", lastName: "Leader", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({
      data: { name: "Ana's Group", leaderId: leader.id, language: [] },
    })
    return { event, group }
  }

  it("names each person and says where they went or why they didn't", async () => {
    const { event, group } = await seed()
    const member = await db.member.create({
      data: { firstName: "Noel", lastName: "Member", dateJoined: new Date(), language: [] },
    })
    const confirmed = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })
    const guest = await db.guest.create({
      data: { firstName: "Mia", lastName: "Guest", language: [] },
    })
    const declined = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    // Someone with no linked person at all — a walk-in typed straight onto the
    // registrant row.
    const deferred = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walk", lastName: "In" },
    })

    const resolved = await resolveSubmissionDecisions([
      {
        id: "sub-1",
        decisions: [
          { registrantId: confirmed.id, status: "confirmed", targetGroupId: group.id },
          {
            registrantId: declined.id,
            status: "declined",
            declineReason: "Others",
            reason: "Moving to Cebu",
          },
          { registrantId: deferred.id, status: "pending" },
        ],
      },
    ])

    expect(resolved.get("sub-1")).toEqual([
      {
        registrantId: confirmed.id,
        name: "Noel Member",
        memberId: member.id,
        status: "confirmed",
        declineReason: null,
        smallGroupId: group.id,
        smallGroupName: "Ana's Group",
      },
      {
        registrantId: declined.id,
        name: "Mia Guest",
        memberId: null,
        status: "declined",
        declineReason: "Others — Moving to Cebu",
        smallGroupId: null,
        smallGroupName: null,
      },
      {
        registrantId: deferred.id,
        name: "Walk In",
        memberId: null,
        status: "deferred",
        declineReason: null,
        smallGroupId: null,
        smallGroupName: null,
      },
    ])
  })

  it("keeps a decision whose registrant or group has since been deleted", async () => {
    const { group } = await seed()
    await db.smallGroup.delete({ where: { id: group.id } })

    const resolved = await resolveSubmissionDecisions([
      {
        id: "sub-1",
        decisions: [{ registrantId: "gone", status: "confirmed", targetGroupId: group.id }],
      },
    ])

    // The submission is an immutable record of what was answered; a deleted
    // target must not erase the fact that someone was confirmed into it.
    expect(resolved.get("sub-1")).toEqual([
      {
        registrantId: "gone",
        name: "Unknown participant",
        memberId: null,
        status: "confirmed",
        declineReason: null,
        smallGroupId: group.id,
        smallGroupName: null,
      },
    ])
  })

  it("returns an entry for every submission, including empty and malformed ones", async () => {
    const resolved = await resolveSubmissionDecisions([
      { id: "sub-empty", decisions: [] },
      { id: "sub-null", decisions: null },
      { id: "sub-junk", decisions: { not: "an array" } },
    ])

    expect([...resolved.keys()].sort()).toEqual(["sub-empty", "sub-junk", "sub-null"])
    expect(resolved.get("sub-junk")).toEqual([])
  })
})
