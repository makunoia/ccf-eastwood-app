import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"

/**
 * CCF-123 regression — an Age Range collected at registration must survive
 * guest→member promotion.
 *
 * Found by audit, not by the original implementation: four separate promotion
 * paths build the new Member from an explicit field list, and all four silently
 * dropped `ageRangeBucketId`. The duplicate-profile merge was fine because it
 * uses a generic `fillNulls` over the whole record instead of a hand-written
 * list — which is exactly why the explicit lists are the fragile ones.
 *
 * The static check below covers all four sites at once, since three of them are
 * reachable only through public token flows that are awkward to drive here.
 */

/** Every promotion site that hand-copies Guest fields onto a new Member. */
const PROMOTION_SITES = [
  "app/(dashboard)/guests/actions.ts",
  "app/small-group-confirmation/[token]/actions.ts",
  // Moved out of app/events/[id]/catch-mech/actions.ts: everything exported from a
  // "use server" file is a public endpoint, and prefetchRegistrantData sitting there
  // let anyone read guest emails/phones/notes by registrant id.
  "lib/catch-mech/confirmations.ts",
  "app/(event)/event/[id]/catch-mech/matching-actions.ts",
]

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "SmallGroupMemberRequest", "SmallGroupLog", "SmallGroup", "Member", "Guest",
    "AgeRangeBucket", "FamilyMember", "Family"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-123 regression — promotion carries the age bracket", () => {
  it("every hand-written promotion site copies ageRangeBucketId", () => {
    // A guard against the next person adding a promotion path — or a new column
    // — and forgetting one of the four.
    for (const site of PROMOTION_SITES) {
      const source = readFileSync(join(process.cwd(), site), "utf8")
      expect(
        source.includes("ageRangeBucketId: guest.ageRangeBucketId"),
        `${site} must carry ageRangeBucketId onto the promoted Member`
      ).toBe(true)
      // It must also be selected, or the copy above reads undefined.
      expect(
        source.includes("ageRangeBucketId: true"),
        `${site} must select ageRangeBucketId on the guest it promotes`
      ).toBe(true)
    }
  })

  it("carries the bracket through promoteGuestToMember", async () => {
    const bucket = await db.ageRangeBucket.create({
      data: { label: "30 – 39", minAge: 30, maxAge: 39, order: 3 },
      select: { id: true },
    })
    const leader = await db.member.create({
      data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
      select: { id: true },
    })
    const group = await db.smallGroup.create({
      data: { name: "Group A", leaderId: leader.id, status: "Active" },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Ella",
        lastName: "Santos",
        phone: "+63 917 222 3333",
        language: [],
        ageRangeBucketId: bucket.id,
      },
      select: { id: true },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)

    const promoted = await db.guest.findUniqueOrThrow({
      where: { id: guest.id },
      select: { memberId: true },
    })
    expect(promoted.memberId).not.toBeNull()

    const member = await db.member.findUniqueOrThrow({
      where: { id: promoted.memberId as string },
      select: { ageRangeBucketId: true },
    })
    expect(member.ageRangeBucketId).toBe(bucket.id)
  })

  it("leaves the bracket null when the guest never picked one", async () => {
    const leader = await db.member.create({
      data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
      select: { id: true },
    })
    const group = await db.smallGroup.create({
      data: { name: "Group B", leaderId: leader.id, status: "Active" },
      select: { id: true },
    })
    const guest = await db.guest.create({
      data: { firstName: "No", lastName: "Bracket", language: [] },
      select: { id: true },
    })

    expect((await promoteGuestToMember(guest.id, group.id)).success).toBe(true)

    const promoted = await db.guest.findUniqueOrThrow({
      where: { id: guest.id },
      select: { memberId: true },
    })
    const member = await db.member.findUniqueOrThrow({
      where: { id: promoted.memberId as string },
      select: { ageRangeBucketId: true },
    })
    expect(member.ageRangeBucketId).toBeNull()
  })
})
