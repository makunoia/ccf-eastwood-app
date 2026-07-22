import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  createFamily,
  updateFamily,
  deleteFamily,
  addFamilyMember,
  removeFamilyMember,
  updateFamilyMemberRole,
} from "@/app/(dashboard)/families/actions"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import { repointFamilyLinks } from "@/lib/family-links"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "EventRegistrant", "Event", "SchedulePreference" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(firstName: string, lastName = "Test") {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [] },
  })
}

async function seedGuest(firstName: string, lastName = "Test") {
  return db.guest.create({ data: { firstName, lastName, language: [] } })
}

describe("Family CRUD", () => {
  it("creates, updates, and deletes a family", async () => {
    const created = await createFamily({ name: "Dela Cruz Family", notes: "" })
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = await updateFamily(created.data.id, {
      name: "Dela Cruz Household",
      notes: "moved to QC",
    })
    expect(updated.success).toBe(true)
    const row = await db.family.findUnique({ where: { id: created.data.id } })
    expect(row?.name).toBe("Dela Cruz Household")
    expect(row?.notes).toBe("moved to QC")

    const deleted = await deleteFamily(created.data.id)
    expect(deleted.success).toBe(true)
    expect(await db.family.count()).toBe(0)
  })

  it("rejects a family with an empty name", async () => {
    const result = await createFamily({ name: "", notes: "" })
    expect(result.success).toBe(false)
  })

  it("tracks a childless couple as a family (no Child role required)", async () => {
    const husband = await seedMember("Juan")
    const wife = await seedMember("Maria")
    const created = await createFamily({ name: "Santos Family", notes: "" })
    expect(created.success).toBe(true)
    if (!created.success) return

    const addH = await addFamilyMember(created.data.id, {
      memberId: husband.id,
      guestId: null,
      role: "FatherHusband",
    })
    const addW = await addFamilyMember(created.data.id, {
      memberId: wife.id,
      guestId: null,
      role: "MotherWife",
    })
    expect(addH.success).toBe(true)
    expect(addW.success).toBe(true)

    const links = await db.familyMember.findMany({
      where: { familyId: created.data.id },
    })
    expect(links).toHaveLength(2)
    expect(links.some((l) => l.role === "Child")).toBe(false)
  })

  it("deleting a family keeps its members and guests", async () => {
    const father = await seedMember("Father")
    const guest = await seedGuest("GuestChild")
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, memberId: father.id, role: "FatherHusband" },
        { familyId: family.id, guestId: guest.id, role: "Child" },
      ],
    })

    const result = await deleteFamily(family.id)
    expect(result.success).toBe(true)
    expect(await db.familyMember.count()).toBe(0)
    expect(await db.member.count()).toBe(1)
    expect(await db.guest.count()).toBe(1)
  })
})

describe("addFamilyMember / removeFamilyMember", () => {
  it("adds a member and a guest with roles", async () => {
    const mother = await seedMember("Mother")
    const guest = await seedGuest("Kid")
    const family = await db.family.create({ data: { name: "F" } })

    const r1 = await addFamilyMember(family.id, {
      memberId: mother.id,
      guestId: null,
      role: "MotherWife",
    })
    const r2 = await addFamilyMember(family.id, {
      memberId: null,
      guestId: guest.id,
      role: "Child",
    })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)

    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(2)
  })

  it("rejects adding the same person to the same family twice", async () => {
    const father = await seedMember("Father")
    const family = await db.family.create({ data: { name: "F" } })

    await addFamilyMember(family.id, { memberId: father.id, guestId: null, role: "FatherHusband" })
    const dup = await addFamilyMember(family.id, {
      memberId: father.id,
      guestId: null,
      role: "Other",
    })
    expect(dup.success).toBe(false)
    expect(await db.familyMember.count()).toBe(1)
  })

  it("allows the same person in two different families (adult child scenario)", async () => {
    const adult = await seedMember("Adult")
    const parentsFamily = await db.family.create({ data: { name: "Parents" } })
    const ownFamily = await db.family.create({ data: { name: "Own" } })

    const asChild = await addFamilyMember(parentsFamily.id, {
      memberId: adult.id,
      guestId: null,
      role: "Child",
    })
    const asFather = await addFamilyMember(ownFamily.id, {
      memberId: adult.id,
      guestId: null,
      role: "FatherHusband",
    })
    expect(asChild.success).toBe(true)
    expect(asFather.success).toBe(true)

    const links = await db.familyMember.findMany({
      where: { memberId: adult.id },
      orderBy: { createdAt: "asc" },
    })
    expect(links.map((l) => l.role).sort()).toEqual(["Child", "FatherHusband"])
  })

  it("rejects adding an already-promoted guest as a guest", async () => {
    const member = await seedMember("Promoted")
    const guest = await db.guest.create({
      data: { firstName: "Promoted", lastName: "Guest", language: [], memberId: member.id },
    })
    const family = await db.family.create({ data: { name: "F" } })

    const result = await addFamilyMember(family.id, {
      memberId: null,
      guestId: guest.id,
      role: "Child",
    })
    expect(result.success).toBe(false)
  })

  it("updates a role and removes a family member", async () => {
    const person = await seedMember("Person")
    const family = await db.family.create({ data: { name: "F" } })
    const added = await addFamilyMember(family.id, {
      memberId: person.id,
      guestId: null,
      role: "Other",
    })
    expect(added.success).toBe(true)
    if (!added.success) return

    const roleResult = await updateFamilyMemberRole(added.data.id, "Guardian")
    expect(roleResult.success).toBe(true)
    const link = await db.familyMember.findUnique({ where: { id: added.data.id } })
    expect(link?.role).toBe("Guardian")

    const removeResult = await removeFamilyMember(added.data.id)
    expect(removeResult.success).toBe(true)
    expect(await db.familyMember.count()).toBe(0)
    expect(await db.member.count()).toBe(1) // person record retained
  })
})

describe("guest promotion repoints family links", () => {
  it("promoteGuestToMember moves the guest's family link onto the new member", async () => {
    const leader = await seedMember("Leader")
    const group = await db.smallGroup.create({ data: { name: "G", leaderId: leader.id } })
    const guest = await seedGuest("Promotee")
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: guest.id, role: "Child" },
    })

    const result = await promoteGuestToMember(guest.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(1)
    expect(links[0].memberId).toBe(result.data.memberId)
    expect(links[0].guestId).toBeNull()
    expect(links[0].role).toBe("Child") // role survives the promotion
  })

  it("drops the guest's link when the member is already in the same family", async () => {
    const member = await seedMember("Existing")
    const guest = await seedGuest("Duplicate")
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: "FatherHusband" },
    })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: guest.id, role: "Other" },
    })

    await db.$transaction(async (tx) => {
      await repointFamilyLinks(tx, { guestId: guest.id }, { memberId: member.id })
    })

    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(1)
    expect(links[0].memberId).toBe(member.id)
    expect(links[0].role).toBe("FatherHusband") // existing member's role wins
  })

  it("repoints back from member to guest (promotion undo direction)", async () => {
    const member = await seedMember("Undone")
    const guest = await seedGuest("Restored")
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: "MotherWife" },
    })

    await db.$transaction(async (tx) => {
      await repointFamilyLinks(tx, { memberId: member.id }, { guestId: guest.id })
    })
    // Undo path deletes the member afterwards — the family link must survive it
    await db.member.delete({ where: { id: member.id } })

    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(1)
    expect(links[0].guestId).toBe(guest.id)
    expect(links[0].memberId).toBeNull()
    expect(links[0].role).toBe("MotherWife")
  })

  it("repoints links across multiple families at once", async () => {
    const guest = await seedGuest("MultiFam")
    const member = await seedMember("MultiFam")
    const famA = await db.family.create({ data: { name: "A" } })
    const famB = await db.family.create({ data: { name: "B" } })
    await db.familyMember.createMany({
      data: [
        { familyId: famA.id, guestId: guest.id, role: "Child" },
        { familyId: famB.id, guestId: guest.id, role: "FatherHusband" },
      ],
    })

    await db.$transaction(async (tx) => {
      await repointFamilyLinks(tx, { guestId: guest.id }, { memberId: member.id })
    })

    const links = await db.familyMember.findMany({
      where: { memberId: member.id },
      orderBy: { role: "asc" },
    })
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.guestId === null)).toBe(true)
  })
})

describe("cascade behavior", () => {
  it("deleting a member removes only their family links", async () => {
    const father = await seedMember("Father")
    const mother = await seedMember("Mother")
    const family = await db.family.create({ data: { name: "F" } })
    await db.familyMember.createMany({
      data: [
        { familyId: family.id, memberId: father.id, role: "FatherHusband" },
        { familyId: family.id, memberId: mother.id, role: "MotherWife" },
      ],
    })

    await db.member.delete({ where: { id: father.id } })

    const links = await db.familyMember.findMany({ where: { familyId: family.id } })
    expect(links).toHaveLength(1)
    expect(links[0].memberId).toBe(mother.id)
  })
})
