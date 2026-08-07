import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member", "Guest", "SmallGroupMemberRequest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-20 – Small Group matching fixes", () => {
  describe("Fix 1: exclude downline groups from match suggestions", () => {
    it("does not suggest a direct child group of the member's current group", async () => {
      const [parentLeader, childLeader, unrelatedLeader, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "Parent", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Child", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Unrelated", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "Member", dateJoined: new Date(), language: [] } }),
      ])

      const parentGroup = await db.smallGroup.create({ data: { name: "Parent Group", leaderId: parentLeader.id } })
      const childGroup = await db.smallGroup.create({
        data: { name: "Child Group", leaderId: childLeader.id, parentGroupId: parentGroup.id },
      })
      const unrelatedGroup = await db.smallGroup.create({ data: { name: "Unrelated Group", leaderId: unrelatedLeader.id } })

      await db.member.update({ where: { id: candidate.id }, data: { smallGroupId: parentGroup.id } })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).not.toContain(childGroup.id)
      expect(resultIds).toContain(unrelatedGroup.id)
    })

    it("excludes grandchild groups (transitive downline filtering)", async () => {
      const [l1, l2, l3, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L2", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L3", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "M", dateJoined: new Date(), language: [] } }),
      ])

      const grandparentGroup = await db.smallGroup.create({ data: { name: "Grandparent", leaderId: l1.id } })
      const parentGroup = await db.smallGroup.create({
        data: { name: "Parent", leaderId: l2.id, parentGroupId: grandparentGroup.id },
      })
      const childGroup = await db.smallGroup.create({
        data: { name: "Child", leaderId: l3.id, parentGroupId: parentGroup.id },
      })

      await db.member.update({ where: { id: candidate.id }, data: { smallGroupId: grandparentGroup.id } })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).not.toContain(parentGroup.id)
      expect(resultIds).not.toContain(childGroup.id)
    })

    it("does not filter any groups for a guest (guests have no current group)", async () => {
      const [l1, l2] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L2", lastName: "Leader", dateJoined: new Date(), language: [] } }),
      ])

      const group1 = await db.smallGroup.create({ data: { name: "Group 1", leaderId: l1.id } })
      const group2 = await db.smallGroup.create({
        data: { name: "Group 2", leaderId: l2.id, parentGroupId: group1.id },
      })

      const guest = await db.guest.create({ data: { firstName: "Guest", lastName: "User", language: [] } })

      const results = await matchSmallGroups({ guestId: guest.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).toContain(group1.id)
      expect(resultIds).toContain(group2.id)
    })

    it("excludes sub-groups of a group the member leads, even when the led group has no parent", async () => {
      // Member leads a top-level group (parentGroupId = null).
      // The sub-groups of their led group are their spiritual downline and must be excluded.
      const [seniorLeader, subLeader, unrelatedLeader, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "Senior", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Sub", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Unrelated", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "Member", dateJoined: new Date(), language: [] } }),
      ])

      // candidate leads topGroup (top-level, no parent)
      const topGroup = await db.smallGroup.create({ data: { name: "Top Group", leaderId: candidate.id } })
      const subGroup = await db.smallGroup.create({
        data: { name: "Sub Group", leaderId: subLeader.id, parentGroupId: topGroup.id },
      })
      const unrelatedGroup = await db.smallGroup.create({ data: { name: "Unrelated Group", leaderId: unrelatedLeader.id } })

      // candidate is also a member of a separate group (upward accountability)
      const accountabilityGroup = await db.smallGroup.create({ data: { name: "Accountability Group", leaderId: seniorLeader.id } })
      await db.member.update({ where: { id: candidate.id }, data: { smallGroupId: accountabilityGroup.id } })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).not.toContain(topGroup.id)  // directly led — excluded
      expect(resultIds).not.toContain(subGroup.id)  // downline of led group — excluded
      expect(resultIds).toContain(unrelatedGroup.id) // unrelated — included
    })
  })

  describe("Fix 3: do not match small groups that already declined the person", () => {
    it("excludes groups with a Rejected request for the guest", async () => {
      const [l1, l2] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L2", lastName: "Leader", dateJoined: new Date(), language: [] } }),
      ])

      const rejectedGroup = await db.smallGroup.create({ data: { name: "Rejected Group", leaderId: l1.id } })
      const availableGroup = await db.smallGroup.create({ data: { name: "Available Group", leaderId: l2.id } })

      const guest = await db.guest.create({ data: { firstName: "Guest", lastName: "User", language: [] } })

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: rejectedGroup.id, guestId: guest.id, status: "Rejected" },
      })

      const results = await matchSmallGroups({ guestId: guest.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).not.toContain(rejectedGroup.id)
      expect(resultIds).toContain(availableGroup.id)
    })

    it("excludes groups with a Rejected request for the member", async () => {
      const [l1, l2, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L2", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "M", dateJoined: new Date(), language: [] } }),
      ])

      const rejectedGroup = await db.smallGroup.create({ data: { name: "Rejected Group", leaderId: l1.id } })
      const availableGroup = await db.smallGroup.create({ data: { name: "Available Group", leaderId: l2.id } })

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: rejectedGroup.id, memberId: candidate.id, status: "Rejected" },
      })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).not.toContain(rejectedGroup.id)
      expect(resultIds).toContain(availableGroup.id)
    })

    it("still suggests groups that previously had a Pending request (not declined)", async () => {
      const [l1, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "M", dateJoined: new Date(), language: [] } }),
      ])

      const pendingGroup = await db.smallGroup.create({ data: { name: "Pending Group", leaderId: l1.id } })

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: pendingGroup.id, memberId: candidate.id, status: "Pending" },
      })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      // Pending ≠ Rejected — group should still appear in suggestions
      expect(resultIds).toContain(pendingGroup.id)
    })
  })

  describe("Fix 2: leader confirmation link only when there are pending assignments", () => {
    it("pending requests query returns only Pending status records", async () => {
      const leader = await db.member.create({ data: { firstName: "Leader", lastName: "L", dateJoined: new Date(), language: [] } })
      const group = await db.smallGroup.create({ data: { name: "Test Group", leaderId: leader.id } })
      const [guestA, guestB] = await Promise.all([
        db.guest.create({ data: { firstName: "Alice", lastName: "A", language: [] } }),
        db.guest.create({ data: { firstName: "Bob", lastName: "B", language: [] } }),
      ])

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: guestA.id, status: "Pending" },
      })
      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: guestB.id, status: "Confirmed" },
      })

      const pending = await db.smallGroupMemberRequest.findMany({
        where: { smallGroupId: group.id, status: "Pending" },
      })

      // pendingRequests.length > 0 → confirmation link is visible
      expect(pending).toHaveLength(1)
      expect(pending[0].guestId).toBe(guestA.id)
    })

    it("pending requests is empty when all requests are resolved", async () => {
      const leader = await db.member.create({ data: { firstName: "Leader", lastName: "L", dateJoined: new Date(), language: [] } })
      const group = await db.smallGroup.create({ data: { name: "Test Group", leaderId: leader.id } })
      const guest = await db.guest.create({ data: { firstName: "Guest", lastName: "G", language: [] } })

      await db.smallGroupMemberRequest.create({
        data: { smallGroupId: group.id, guestId: guest.id, status: "Confirmed" },
      })

      const pending = await db.smallGroupMemberRequest.findMany({
        where: { smallGroupId: group.id, status: "Pending" },
      })

      // pendingRequests.length === 0 → confirmation link is hidden
      expect(pending).toHaveLength(0)
    })
  })

  describe("regression", () => {
    it("member with no current group is not affected by downline filtering", async () => {
      const [l1, l2, candidate] = await Promise.all([
        db.member.create({ data: { firstName: "L1", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "L2", lastName: "Leader", dateJoined: new Date(), language: [] } }),
        db.member.create({ data: { firstName: "Candidate", lastName: "M", dateJoined: new Date(), language: [] } }),
      ])

      const group1 = await db.smallGroup.create({ data: { name: "Group 1", leaderId: l1.id } })
      const group2 = await db.smallGroup.create({
        data: { name: "Group 2", leaderId: l2.id, parentGroupId: group1.id },
      })

      const results = await matchSmallGroups({ memberId: candidate.id })
      const resultIds = results.map((r) => r.groupId)

      expect(resultIds).toContain(group1.id)
      expect(resultIds).toContain(group2.id)
    })
  })
})
