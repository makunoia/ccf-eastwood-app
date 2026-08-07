import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { allTokensMatch, personSearchWhere } from "@/lib/search/name-search"
import { searchGuests, searchMembersForLeaderLookup } from "@/app/(dashboard)/guests/actions"

/**
 * Ticket verification suite for CCF-115 — search fields didn't match a combined
 * "First Last" query; only the first name or the last name on its own returned
 * anything.
 *
 * The regression tests below run the real filters against Postgres, because the
 * bug was in the query shape rather than in any pure function: a flat OR of
 * `contains` clauses can't match a string spanning two columns.
 *
 * Run locally:  pnpm verify:ticket CCF-115
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "Family", "FamilyMember" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(
  firstName: string,
  lastName: string,
  over: Partial<Prisma.MemberCreateInput> = {}
) {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [], ...over },
  })
}

describe("CCF-115", () => {
  describe("regression — full name search", () => {
    it("matches a member by their combined first + last name", async () => {
      const maria = await seedMember("Maria", "Santos")
      await seedMember("Maria", "Cruz")
      await seedMember("Juan", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("Maria Santos") as Prisma.MemberWhereInput,
        select: { id: true },
      })

      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("still matches on the first name alone", async () => {
      const maria = await seedMember("Maria", "Santos")
      await seedMember("Juan", "Cruz")

      const found = await db.member.findMany({
        where: personSearchWhere("Maria") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("still matches on the last name alone", async () => {
      const maria = await seedMember("Maria", "Santos")
      await seedMember("Juan", "Cruz")

      const found = await db.member.findMany({
        where: personSearchWhere("Santos") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("ignores token order — \"Santos Maria\" finds Maria Santos", async () => {
      const maria = await seedMember("Maria", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("Santos Maria") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("matches a partial full name — \"Mar San\"", async () => {
      const maria = await seedMember("Maria", "Santos")
      await seedMember("Juan", "Cruz")

      const found = await db.member.findMany({
        where: personSearchWhere("Mar San") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("is case-insensitive across tokens", async () => {
      const maria = await seedMember("Maria", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("mARIa sANTOs") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("matches a nickname combined with a last name", async () => {
      const maria = await seedMember("Maria", "Santos", { nickname: "Mimi" })

      const found = await db.member.findMany({
        where: personSearchWhere("Mimi Santos") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })
  })

  describe("edge cases", () => {
    it("requires every token — a wrong surname excludes the match", async () => {
      await seedMember("Maria", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("Maria Reyes") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found).toHaveLength(0)
    })

    it("does not cross-match two different people sharing one token each", async () => {
      await seedMember("Maria", "Cruz")
      await seedMember("Juan", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("Maria Santos") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found).toHaveLength(0)
    })

    it("matches a canonical phone number pasted with its spaces", async () => {
      const maria = await seedMember("Maria", "Santos", { phone: "+63 917 123 4567" })
      await seedMember("Juan", "Cruz", { phone: "+63 918 999 0000" })

      const found = await db.member.findMany({
        where: personSearchWhere("+63 917 123 4567") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("matches a partial phone fragment", async () => {
      const maria = await seedMember("Maria", "Santos", { phone: "+63 917 123 4567" })
      await seedMember("Juan", "Cruz", { phone: "+63 918 999 0000" })

      const found = await db.member.findMany({
        where: personSearchWhere("917 123") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })

    it("a blank query yields no filter, so callers fall back to unfiltered", async () => {
      await seedMember("Maria", "Santos")
      expect(personSearchWhere("   ")).toBeNull()
    })

    it("tolerates duplicated whitespace between names", async () => {
      const maria = await seedMember("Maria", "Santos")

      const found = await db.member.findMany({
        where: personSearchWhere("Maria    Santos") as Prisma.MemberWhereInput,
        select: { id: true },
      })
      expect(found.map((m) => m.id)).toEqual([maria.id])
    })
  })

  describe("integration — search server actions", () => {
    it("searchGuests finds a guest by full name", async () => {
      const guest = await db.guest.create({
        data: { firstName: "Maria", lastName: "Santos", language: [] },
      })
      await db.guest.create({
        data: { firstName: "Maria", lastName: "Cruz", language: [] },
      })

      const result = await searchGuests("Maria Santos")
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.map((g) => g.id)).toEqual([guest.id])
    })

    it("searchGuests keeps excluding promoted guests when matching a full name", async () => {
      const member = await seedMember("Maria", "Santos")
      await db.guest.create({
        data: { firstName: "Maria", lastName: "Santos", language: [], memberId: member.id },
      })

      const result = await searchGuests("Maria Santos")
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data).toHaveLength(0)
    })

    it("searchMembersForLeaderLookup finds a leader by full name, and still only leaders", async () => {
      const leader = await seedMember("Maria", "Santos")
      await seedMember("Maria", "Reyes") // matches nothing — different surname
      const nonLeader = await seedMember("Maria", "Santos")
      await db.smallGroup.create({ data: { name: "Ortigas Young Pro", leaderId: leader.id } })

      const result = await searchMembersForLeaderLookup("Maria Santos")
      expect(result.success).toBe(true)
      if (!result.success) return
      const ids = result.data.map((m) => m.id)
      expect(ids).toContain(leader.id)
      expect(ids).not.toContain(nonLeader.id)
    })
  })

  describe("integration — DGroup list search", () => {
    it("finds a group by its leader's full name", async () => {
      const leader = await seedMember("Maria", "Santos")
      const other = await seedMember("Juan", "Cruz")
      const group = await db.smallGroup.create({
        data: { name: "Ortigas Young Pro", leaderId: leader.id },
      })
      await db.smallGroup.create({ data: { name: "Makati Singles", leaderId: other.id } })

      const where = allTokensMatch("Maria Santos", (token) => [
        { name: { contains: token, mode: "insensitive" as const } },
        { leader: { firstName: { contains: token, mode: "insensitive" as const } } },
        { leader: { lastName: { contains: token, mode: "insensitive" as const } } },
      ]) as Prisma.SmallGroupWhereInput

      const found = await db.smallGroup.findMany({ where, select: { id: true } })
      expect(found.map((g) => g.id)).toEqual([group.id])
    })

    it("still finds a group by a multi-word group name", async () => {
      const leader = await seedMember("Maria", "Santos")
      const group = await db.smallGroup.create({
        data: { name: "Ortigas Young Pro", leaderId: leader.id },
      })

      const where = allTokensMatch("Ortigas Young", (token) => [
        { name: { contains: token, mode: "insensitive" as const } },
        { leader: { firstName: { contains: token, mode: "insensitive" as const } } },
        { leader: { lastName: { contains: token, mode: "insensitive" as const } } },
      ]) as Prisma.SmallGroupWhereInput

      const found = await db.smallGroup.findMany({ where, select: { id: true } })
      expect(found.map((g) => g.id)).toEqual([group.id])
    })
  })
})
