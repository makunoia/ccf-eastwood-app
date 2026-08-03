import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { lookupVolunteer, submitVolunteerInfo } from "@/app/events/[id]/volunteer-info/actions"
import type { GroupFields } from "@/app/events/[id]/volunteer-info/types"

/**
 * Leadership handling in the public volunteer-info form.
 *
 * The form offers two choices — "I lead a group" and "I want to lead a group"
 * (Timothy). The regression pinned here: a Timothy whose group has since been
 * activated by someone else must not be demoted back to Timothy on every save.
 */

const PHONE = "+63 917 555 0101"

beforeEach(async () => {
  await db.$executeRaw`
    TRUNCATE
      "Volunteer", "CommitteeRole", "VolunteerCommittee",
      "SmallGroupLog", "SmallGroup", "SchedulePreference", "MemberLog",
      "Member", "Event"
    RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

function groupFields(overrides: Partial<GroupFields> = {}): GroupFields {
  return {
    name: "Friday Night Group",
    lifeStageIds: [],
    genderFocus: null,
    language: [],
    ageRangeMin: null,
    ageRangeMax: null,
    meetingFormat: null,
    locationCity: null,
    memberLimit: null,
    scheduleDayOfWeek: null,
    scheduleTimeStart: null,
    scheduleTimeEnd: null,
    ...overrides,
  }
}

async function seed() {
  const event = await db.event.create({
    data: { name: "Volunteer Night", type: "OneTime", startDate: new Date(), endDate: new Date() },
    select: { id: true },
  })
  const member = await db.member.create({
    data: {
      firstName: "Ramon",
      lastName: "Cruz",
      dateJoined: new Date(),
      language: [],
      phone: PHONE,
    },
    select: { id: true },
  })
  return { eventId: event.id, memberId: member.id }
}

async function addVolunteer(eventId: string, memberId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushering", eventId },
    select: { id: true },
  })
  const role = await db.committeeRole.create({
    data: { name: "Greeter", committeeId: committee.id },
    select: { id: true },
  })
  await db.volunteer.create({
    data: { memberId, eventId, committeeId: committee.id, preferredRoleId: role.id, status: "Pending" },
  })
}

function baseInput(memberId: string, eventId: string) {
  return {
    memberId,
    eventId,
    firstName: "Ramon",
    lastName: "Cruz",
    email: null,
    phone: PHONE,
    groupId: null,
  }
}

describe("volunteer-info leadership", () => {
  describe('"I lead a group"', () => {
    it("creates an Active group and marks the member a Leader", async () => {
      const { eventId, memberId } = await seed()

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupFields: groupFields(),
      })

      expect(res.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { leaderId: memberId } })
      expect(group?.status).toBe("Active")
      expect(group?.name).toBe("Friday Night Group")
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.groupStatus).toBe("Leader")
    })
  })

  describe('"I want to lead a group" (Timothy)', () => {
    it("creates a Pending group and marks the member a Timothy", async () => {
      const { eventId, memberId } = await seed()

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "timothy",
        groupFields: groupFields({ name: "Intended Group" }),
      })

      expect(res.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { leaderId: memberId } })
      expect(group?.status).toBe("Pending")
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.groupStatus).toBe("Timothy")
    })

    it("logs the group as prepared, pending its first member", async () => {
      const { eventId, memberId } = await seed()

      await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "timothy",
        groupFields: groupFields({ name: "Intended Group" }),
      })

      const log = await db.smallGroupLog.findFirst({ where: { action: "GroupCreated" } })
      expect(log?.description).toContain("pending first member")
    })

    it("leaves a still-Pending group Pending on a repeat save", async () => {
      const { eventId, memberId } = await seed()
      const input = {
        ...baseInput(memberId, eventId),
        leadershipStatus: "timothy" as const,
        groupFields: groupFields({ name: "Intended Group" }),
      }

      await submitVolunteerInfo(input)
      const created = await db.smallGroup.findFirst({ where: { leaderId: memberId } })
      await submitVolunteerInfo({ ...input, groupId: created!.id })

      const group = await db.smallGroup.findUnique({ where: { id: created!.id } })
      expect(group?.status).toBe("Pending")
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.groupStatus).toBe("Timothy")
    })
  })

  describe("regression: an activated group must not demote its leader", () => {
    it("promotes to Leader when a timothy submission targets an already-Active group", async () => {
      const { eventId, memberId } = await seed()
      // The Timothy prepares their intended group…
      await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "timothy",
        groupFields: groupFields({ name: "Intended Group" }),
      })
      const created = await db.smallGroup.findFirst({ where: { leaderId: memberId } })
      // …then someone is added elsewhere, which flips the group live.
      await db.smallGroup.update({ where: { id: created!.id }, data: { status: "Active" } })

      // They reopen the form and save again — the stale toggle still says timothy.
      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "timothy",
        groupId: created!.id,
        groupFields: groupFields({ name: "Intended Group" }),
      })

      expect(res.success).toBe(true)
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.groupStatus).toBe("Leader")
      const group = await db.smallGroup.findUnique({ where: { id: created!.id } })
      expect(group?.status).toBe("Active")
    })

    it("surfaces the Active group as 'leader' on lookup, despite a stale Timothy groupStatus", async () => {
      const { eventId, memberId } = await seed()
      await addVolunteer(eventId, memberId)
      await db.member.update({ where: { id: memberId }, data: { groupStatus: "Timothy" } })
      await db.smallGroup.create({
        data: { name: "Live Group", leaderId: memberId, status: "Active", language: [] },
      })

      const res = await lookupVolunteer(eventId, PHONE)

      expect(res.success).toBe(true)
      // The client derives "leader" from this; the raw groupStatus is still stale.
      expect(res.success && res.data.ledGroups[0].status).toBe("Active")
      expect(res.success && res.data.groupStatus).toBe("Timothy")
    })
  })

  describe("claiming leadership over a prepared group", () => {
    it("activates a Pending group when the member declares they lead it", async () => {
      const { eventId, memberId } = await seed()
      const group = await db.smallGroup.create({
        data: { name: "Prepared Group", leaderId: memberId, status: "Pending", language: [] },
        select: { id: true },
      })

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupId: group.id,
        groupFields: groupFields({ name: "Prepared Group" }),
      })

      expect(res.success).toBe(true)
      const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
      expect(updated?.status).toBe("Active")
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.groupStatus).toBe("Leader")
      const log = await db.memberLog.findFirst({ where: { memberId } })
      expect(log?.description).toContain("Activated group")
    })

    it("does not resurrect an Inactive group", async () => {
      const { eventId, memberId } = await seed()
      const group = await db.smallGroup.create({
        data: { name: "Old Group", leaderId: memberId, status: "Inactive", language: [] },
        select: { id: true },
      })

      await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupId: group.id,
        groupFields: groupFields({ name: "Old Group" }),
      })

      const updated = await db.smallGroup.findUnique({ where: { id: group.id } })
      expect(updated?.status).toBe("Inactive")
    })
  })

  describe("edge cases", () => {
    it('a legacy "none" submission saves personal info without touching leadership', async () => {
      const { eventId, memberId } = await seed()
      await db.member.update({ where: { id: memberId }, data: { groupStatus: "Leader" } })

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        firstName: "Ramon Jr",
        leadershipStatus: "none",
        groupFields: null,
      })

      expect(res.success).toBe(true)
      const member = await db.member.findUnique({ where: { id: memberId } })
      expect(member?.firstName).toBe("Ramon Jr")
      // Never demoted by a bare personal-info save.
      expect(member?.groupStatus).toBe("Leader")
      expect(await db.smallGroup.count()).toBe(0)
    })

    it("rejects a groupId that belongs to someone else's group", async () => {
      const { eventId, memberId } = await seed()
      const other = await db.member.create({
        data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
        select: { id: true },
      })
      const foreign = await db.smallGroup.create({
        data: { name: "Not Yours", leaderId: other.id, status: "Active", language: [] },
        select: { id: true },
      })

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupId: foreign.id,
        groupFields: groupFields(),
      })

      expect(res.success).toBe(false)
      expect(res.success === false && res.error).toBe("Group not found")
      const untouched = await db.smallGroup.findUnique({ where: { id: foreign.id } })
      expect(untouched?.name).toBe("Not Yours")
    })

    it("replaces the member's schedule preferences with the group's meeting time", async () => {
      const { eventId, memberId } = await seed()
      await db.schedulePreference.create({
        data: { memberId, dayOfWeek: 1, timeStart: "18:00", timeEnd: "20:00" },
      })

      await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupFields: groupFields({
          scheduleDayOfWeek: 5,
          scheduleTimeStart: "19:00",
          scheduleTimeEnd: "21:00",
        }),
      })

      const prefs = await db.schedulePreference.findMany({ where: { memberId } })
      expect(prefs).toHaveLength(1)
      expect(prefs[0].dayOfWeek).toBe(5)
      expect(prefs[0].timeStart).toBe("19:00")
    })

    it("rejects an empty group name", async () => {
      const { eventId, memberId } = await seed()

      const res = await submitVolunteerInfo({
        ...baseInput(memberId, eventId),
        leadershipStatus: "leader",
        groupFields: groupFields({ name: "" }),
      })

      expect(res.success).toBe(false)
      expect(await db.smallGroup.count()).toBe(0)
    })
  })
})
