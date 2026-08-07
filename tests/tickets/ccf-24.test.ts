import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createSmallGroupForTimothy } from "@/app/events/[id]/catch-mech/actions"
import { submitMemberConfirmations } from "@/app/small-group-confirmation/[token]/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "CatchMechSession", "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventMinistry", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedTimothy() {
  const parentLeader = await db.member.create({
    data: { firstName: "Parent", lastName: "Leader", dateJoined: new Date(), language: [] },
  })
  const parentGroup = await db.smallGroup.create({
    data: { name: "Parent Group", leaderId: parentLeader.id },
  })
  const timothy = await db.member.create({
    data: {
      firstName: "Timothy",
      lastName: "Faci",
      dateJoined: new Date(),
      language: [],
      groupStatus: "Timothy",
      smallGroupId: parentGroup.id,
    },
  })
  return { timothy, parentGroup }
}

async function createBreakoutGroupForMember(memberId: string, bgName: string, linkedSmallGroupId?: string | null) {
  const event = await db.event.create({
    data: { name: `Event for ${bgName}`, type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Committee", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const volunteer = await db.volunteer.create({
    data: { memberId, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id },
  })
  const breakoutGroup = await db.breakoutGroup.create({
    data: {
      name: bgName,
      eventId: event.id,
      facilitatorId: volunteer.id,
      linkedSmallGroupId: linkedSmallGroupId ?? null,
    },
  })
  return { event, volunteer, breakoutGroup }
}

describe("CCF-24 – Auto-update Breakout Group linked small group on Timothy→Leader transition", () => {
  describe("Catch Mech path: createSmallGroupForTimothy", () => {
    it("links the current breakout group to the new small group", async () => {
      const { timothy } = await seedTimothy()
      const { event, volunteer, breakoutGroup } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const session = await db.catchMechSession.create({
        data: { eventId: event.id, breakoutGroupId: breakoutGroup.id, facilitatorVolunteerId: volunteer.id },
      })

      const result = await createSmallGroupForTimothy(session.token, "Timothy's Group", [])

      expect(result.success).toBe(true)
      const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
      expect(updated?.linkedSmallGroupId).not.toBeNull()
    })

    it("also links other breakout groups from other events where Timothy is a facilitator", async () => {
      const { timothy } = await seedTimothy()
      const { event: eventA, volunteer: volunteerA, breakoutGroup: bgA } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const { breakoutGroup: bgB } = await createBreakoutGroupForMember(timothy.id, "BG Event B")

      const session = await db.catchMechSession.create({
        data: { eventId: eventA.id, breakoutGroupId: bgA.id, facilitatorVolunteerId: volunteerA.id },
      })

      const result = await createSmallGroupForTimothy(session.token, "Timothy's Group", [])

      expect(result.success).toBe(true)
      const updatedBgA = await db.breakoutGroup.findUnique({ where: { id: bgA.id } })
      const updatedBgB = await db.breakoutGroup.findUnique({ where: { id: bgB.id } })

      expect(updatedBgA?.linkedSmallGroupId).not.toBeNull()
      expect(updatedBgB?.linkedSmallGroupId).not.toBeNull()
      expect(updatedBgA?.linkedSmallGroupId).toBe(updatedBgB?.linkedSmallGroupId)
    })

    it("does not overwrite breakout groups that are already linked to a different small group", async () => {
      const { timothy } = await seedTimothy()
      const existingLeader = await db.member.create({
        data: { firstName: "Existing", lastName: "Leader", dateJoined: new Date(), language: [] },
      })
      const existingGroup = await db.smallGroup.create({
        data: { name: "Existing Group", leaderId: existingLeader.id },
      })

      const { event: eventA, volunteer: volunteerA, breakoutGroup: bgA } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const { breakoutGroup: bgB } = await createBreakoutGroupForMember(timothy.id, "BG Event B", existingGroup.id)

      const session = await db.catchMechSession.create({
        data: { eventId: eventA.id, breakoutGroupId: bgA.id, facilitatorVolunteerId: volunteerA.id },
      })

      await createSmallGroupForTimothy(session.token, "Timothy's Group", [])

      const updatedBgB = await db.breakoutGroup.findUnique({ where: { id: bgB.id } })
      expect(updatedBgB?.linkedSmallGroupId).toBe(existingGroup.id)
    })

    it("promotes Timothy's groupStatus to Leader", async () => {
      const { timothy } = await seedTimothy()
      const { event, volunteer, breakoutGroup } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const session = await db.catchMechSession.create({
        data: { eventId: event.id, breakoutGroupId: breakoutGroup.id, facilitatorVolunteerId: volunteer.id },
      })

      await createSmallGroupForTimothy(session.token, "Timothy's Group", [])

      const updated = await db.member.findUnique({ where: { id: timothy.id } })
      expect(updated?.groupStatus).toBe("Leader")
    })

    it("all linked breakout groups point to the same newly created small group", async () => {
      const { timothy } = await seedTimothy()
      const { event: eventA, volunteer: volunteerA, breakoutGroup: bgA } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const { breakoutGroup: bgB } = await createBreakoutGroupForMember(timothy.id, "BG Event B")
      const { breakoutGroup: bgC } = await createBreakoutGroupForMember(timothy.id, "BG Event C")

      const session = await db.catchMechSession.create({
        data: { eventId: eventA.id, breakoutGroupId: bgA.id, facilitatorVolunteerId: volunteerA.id },
      })

      await createSmallGroupForTimothy(session.token, "Timothy's Group", [])

      const newGroup = await db.smallGroup.findFirst({ where: { leaderId: timothy.id } })
      expect(newGroup).not.toBeNull()

      const [updatedA, updatedB, updatedC] = await Promise.all([
        db.breakoutGroup.findUnique({ where: { id: bgA.id } }),
        db.breakoutGroup.findUnique({ where: { id: bgB.id } }),
        db.breakoutGroup.findUnique({ where: { id: bgC.id } }),
      ])

      expect(updatedA?.linkedSmallGroupId).toBe(newGroup!.id)
      expect(updatedB?.linkedSmallGroupId).toBe(newGroup!.id)
      expect(updatedC?.linkedSmallGroupId).toBe(newGroup!.id)
    })
  })

  describe("Small Group confirmation link path: submitMemberConfirmations", () => {
    it("links unlinked breakout groups when a leader submits confirmations", async () => {
      const leader = await db.member.create({
        data: { firstName: "Leader", lastName: "L", dateJoined: new Date(), language: [] },
      })
      const smallGroup = await db.smallGroup.create({
        data: { name: "Leader's Group", leaderId: leader.id, leaderConfirmationToken: "test-token-sg-confirm" },
      })
      const { breakoutGroup } = await createBreakoutGroupForMember(leader.id, "Unlinked BG")

      // At least one decision is required; this non-existent ID is safely skipped
      const result = await submitMemberConfirmations("test-token-sg-confirm", [
        { requestId: "non-existent-id", status: "pending" },
      ])

      expect(result.success).toBe(true)
      const updated = await db.breakoutGroup.findUnique({ where: { id: breakoutGroup.id } })
      expect(updated?.linkedSmallGroupId).toBe(smallGroup.id)
    })
  })

  describe("regression", () => {
    it("createSmallGroupForTimothy returns error if Timothy already leads a group", async () => {
      const { timothy } = await seedTimothy()
      await db.smallGroup.create({ data: { name: "Existing Group", leaderId: timothy.id } })

      const { event, volunteer, breakoutGroup } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const session = await db.catchMechSession.create({
        data: { eventId: event.id, breakoutGroupId: breakoutGroup.id, facilitatorVolunteerId: volunteer.id },
      })

      const result = await createSmallGroupForTimothy(session.token, "Another Group", [])

      expect(result.success).toBe(false)
    })

    it("createSmallGroupForTimothy creates exactly one small group for the Timothy", async () => {
      const { timothy } = await seedTimothy()
      const { event, volunteer, breakoutGroup } = await createBreakoutGroupForMember(timothy.id, "BG Event A")
      const session = await db.catchMechSession.create({
        data: { eventId: event.id, breakoutGroupId: breakoutGroup.id, facilitatorVolunteerId: volunteer.id },
      })

      await createSmallGroupForTimothy(session.token, "My Group", [])

      const groups = await db.smallGroup.findMany({ where: { leaderId: timothy.id } })
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe("My Group")
    })
  })
})
