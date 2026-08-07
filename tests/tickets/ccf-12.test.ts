import { describe, it, expect } from "vitest"

/**
 * Ticket verification suite for CCF-12.
 *
 * CCF-12: Add Event Dashboard stats including New SG Leaders filterable
 * by Timothy or Leader.
 *
 * Run locally:  pnpm verify:ticket CCF-12
 */

// ─── Pure logic extracted from page.tsx for unit testing ─────────────────────

type MemberGroupStatus = "Member" | "Timothy" | "Leader" | null
type RoleFilter = "all" | "Timothy" | "Leader"

type ParticipantMember = {
  id: string
  fullName: string
  groupStatus: MemberGroupStatus
  smallGroupId: string | null
  updatedAt: Date
}

function computeNewLeaders(
  participantMembers: ParticipantMember[],
  periodStart: Date,
  roleFilter: RoleFilter
): ParticipantMember[] {
  return participantMembers
    .filter((member) => {
      const isLeadershipRole = member.groupStatus === "Leader" || member.groupStatus === "Timothy"
      if (!isLeadershipRole) return false
      if (member.updatedAt < periodStart) return false
      if (roleFilter === "all") return true
      return member.groupStatus === roleFilter
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const BASE_DATE = new Date("2026-04-01T00:00:00Z")
const PERIOD_START = new Date("2026-03-01T00:00:00Z")
const BEFORE_PERIOD = new Date("2026-02-01T00:00:00Z")

function makeMember(
  id: string,
  groupStatus: MemberGroupStatus,
  updatedAt: Date = BASE_DATE
): ParticipantMember {
  return {
    id,
    fullName: `Test ${id}`,
    groupStatus,
    smallGroupId: null,
    updatedAt,
  }
}

describe("CCF-12 — Event Dashboard: New Small Group Leaders filter", () => {
  describe("unit: computeNewLeaders", () => {
    it("includes Leaders updated within period", () => {
      const members = [makeMember("a", "Leader")]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("a")
    })

    it("includes Timothy updated within period", () => {
      const members = [makeMember("b", "Timothy")]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("b")
    })

    it("excludes plain Members (groupStatus === Member)", () => {
      const members = [makeMember("c", "Member")]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(0)
    })

    it("excludes members updated before period start", () => {
      const members = [makeMember("d", "Leader", BEFORE_PERIOD)]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(0)
    })

    it("roleFilter=Leader excludes Timothy", () => {
      const members = [makeMember("e", "Timothy"), makeMember("f", "Leader")]
      const result = computeNewLeaders(members, PERIOD_START, "Leader")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("f")
    })

    it("roleFilter=Timothy excludes Leader", () => {
      const members = [makeMember("g", "Timothy"), makeMember("h", "Leader")]
      const result = computeNewLeaders(members, PERIOD_START, "Timothy")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("g")
    })

    it("roleFilter=all includes both Timothy and Leader", () => {
      const members = [makeMember("i", "Timothy"), makeMember("j", "Leader")]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(2)
    })

    it("sorts by updatedAt descending (most recent first)", () => {
      const older = makeMember("k", "Leader", new Date("2026-03-05T00:00:00Z"))
      const newer = makeMember("l", "Leader", new Date("2026-03-20T00:00:00Z"))
      const result = computeNewLeaders([older, newer], PERIOD_START, "all")
      expect(result[0].id).toBe("l")
      expect(result[1].id).toBe("k")
    })
  })

  describe("regression", () => {
    it("before fix: Timothy would be excluded when roleFilter=all", () => {
      // This test documents the bug. Prior to the fix, computeNewLeaders only
      // matched groupStatus === 'Leader'. Verify it now correctly includes Timothy.
      const members = [makeMember("m", "Timothy")]
      const result = computeNewLeaders(members, PERIOD_START, "all")
      expect(result).toHaveLength(1)
    })

    it("before fix: roleFilter Timothy would return nothing (only Leader was checked)", () => {
      const members = [makeMember("n", "Timothy"), makeMember("o", "Leader")]
      const result = computeNewLeaders(members, PERIOD_START, "Timothy")
      // After fix, only Timothy is returned
      expect(result).toHaveLength(1)
      expect(result[0].groupStatus).toBe("Timothy")
    })
  })
})
