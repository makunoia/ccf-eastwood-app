import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getDuplicateProfiles } from "@/app/(dashboard)/settings/duplicate-profiles/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "LifeStage", "SmallGroup" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

function member(firstName: string, lastName: string, extra: { phone?: string; email?: string } = {}) {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [], ...extra },
  })
}

function guest(firstName: string, lastName: string, extra: { phone?: string; email?: string; memberId?: string } = {}) {
  return db.guest.create({ data: { firstName, lastName, language: [], ...extra } })
}

async function nameGroups() {
  const result = await getDuplicateProfiles()
  expect(result.success).toBe(true)
  if (!result.success) throw new Error("unreachable")
  return result.data.filter((g) => g.field === "name")
}

describe("duplicate profiles — name detection", () => {
  it("flags two Guests with the same name and no contact info", async () => {
    await guest("Maria", "Santos")
    await guest("maria", "SANTOS")

    const groups = await nameGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].records).toHaveLength(2)
    expect(groups[0].value).toBe("Maria Santos")
  })

  it("flags a Member and a Guest sharing a name", async () => {
    await member("Juan", "dela Cruz")
    await guest("Juan", "Dela Cruz")

    const groups = await nameGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].records.map((r) => r.recordType).sort()).toEqual(["guest", "member"])
  })

  it("flags a first/last swap", async () => {
    await member("Maria", "Santos")
    await guest("Santos", "Maria")

    expect(await nameGroups()).toHaveLength(1)
  })

  it("does not flag different people who share only a first name", async () => {
    await member("Maria", "Santos")
    await guest("Maria", "Reyes")

    expect(await nameGroups()).toHaveLength(0)
  })

  it("does not flag a single-token name shared by two records", async () => {
    await guest("Maria", "")
    await guest("Maria", "")

    expect(await nameGroups()).toHaveLength(0)
  })

  it("excludes promoted guests, like contact detection does", async () => {
    const m = await member("Juan", "dela Cruz")
    await guest("Juan", "dela Cruz", { memberId: m.id })

    expect(await nameGroups()).toHaveLength(0)
  })

  it("suppresses a name group already covered by a contact group", async () => {
    await member("Juan", "dela Cruz", { phone: "+63 917 111 1111" })
    await guest("Juan", "dela Cruz", { phone: "+63 917 111 1111" })

    const result = await getDuplicateProfiles()
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].field).toBe("phone")
  })

  it("still reports the name group when only some of its records share a phone", async () => {
    await member("Juan", "dela Cruz", { phone: "+63 917 111 1111" })
    await guest("Juan", "dela Cruz", { phone: "+63 917 111 1111" })
    await guest("Juan", "Dela  Cruz", { phone: "+63 917 222 2222" })

    const result = await getDuplicateProfiles()
    expect(result.success).toBe(true)
    if (!result.success) return
    const names = result.data.filter((g) => g.field === "name")
    expect(names).toHaveLength(1)
    expect(names[0].records).toHaveLength(3)
    expect(result.data.some((g) => g.field === "phone")).toBe(true)
  })

  it("keeps a generational suffix out of the same group", async () => {
    await member("Juan", "Cruz")
    await guest("Juan", "Cruz Jr.")

    expect(await nameGroups()).toHaveLength(0)
  })
})
