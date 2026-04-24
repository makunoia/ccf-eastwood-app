import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  createMember,
  updateMember,
  deleteMember,
} from "@/app/(dashboard)/members/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const BASE_FORM = {
  firstName: "John",
  lastName: "Smith",
  email: "",
  phone: "",
  address: "",
  dateJoined: "2025-01-15",
  notes: "",
  lifeStageId: "",
  gender: "",
  language: [] as string[],
  birthMonth: "",
  birthYear: "",
  workCity: "",
  workIndustry: "",
  meetingPreference: "",
}

describe("createMember", () => {
  it("creates a member and returns its id", async () => {
    const result = await createMember(BASE_FORM)
    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUnique({ where: { id: result.data.id } })
    expect(member?.firstName).toBe("John")
    expect(member?.lastName).toBe("Smith")
    expect(member?.dateJoined).toBeInstanceOf(Date)
  })

  it("stores optional fields correctly", async () => {
    const result = await createMember({
      ...BASE_FORM,
      email: "john@example.com",
      phone: "09171234567",
      address: "123 Main St",
      gender: "Male",
      language: ["Filipino", "English"],
      birthMonth: "3",
      birthYear: "1990",
      workCity: "Makati",
      workIndustry: "Finance",
      meetingPreference: "Hybrid",
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const member = await db.member.findUnique({ where: { id: result.data.id } })
    expect(member?.email).toBe("john@example.com")
    expect(member?.phone).toBe("09171234567")
    expect(member?.gender).toBe("Male")
    expect(member?.birthMonth).toBe(3)
    expect(member?.birthYear).toBe(1990)
    expect(member?.language).toEqual(["Filipino", "English"])
    expect(member?.meetingPreference).toBe("Hybrid")
  })

  it("rejects invalid input and returns a validation error", async () => {
    const result = await createMember({ ...BASE_FORM, firstName: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("First name is required")
  })

  it("returns a duplicate-email error on unique constraint violation", async () => {
    await createMember({ ...BASE_FORM, email: "dupe@example.com" })
    const result = await createMember({ ...BASE_FORM, email: "dupe@example.com" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("A member with this email already exists")
  })
})

describe("updateMember", () => {
  it("updates an existing member's fields", async () => {
    const created = await db.member.create({
      data: { firstName: "Jane", lastName: "Doe", dateJoined: new Date() },
      select: { id: true },
    })

    const result = await updateMember(created.id, {
      ...BASE_FORM,
      firstName: "Janet",
      email: "janet@example.com",
    })
    expect(result.success).toBe(true)

    const member = await db.member.findUnique({ where: { id: created.id } })
    expect(member?.firstName).toBe("Janet")
    expect(member?.email).toBe("janet@example.com")
  })

  it("returns a duplicate-email error when updating to an existing email", async () => {
    await db.member.create({
      data: { firstName: "Alice", lastName: "A", email: "alice@example.com", dateJoined: new Date() },
    })
    const bob = await db.member.create({
      data: { firstName: "Bob", lastName: "B", dateJoined: new Date() },
      select: { id: true },
    })

    const result = await updateMember(bob.id, { ...BASE_FORM, email: "alice@example.com" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("A member with this email already exists")
  })
})

describe("deleteMember", () => {
  it("hard deletes an existing member", async () => {
    const member = await db.member.create({
      data: { firstName: "Jane", lastName: "Doe", dateJoined: new Date() },
      select: { id: true },
    })

    const result = await deleteMember(member.id)
    expect(result.success).toBe(true)

    const found = await db.member.findUnique({ where: { id: member.id } })
    expect(found).toBeNull()
  })

  it("returns an error for a non-existent member id", async () => {
    const result = await deleteMember("non-existent-id")
    expect(result.success).toBe(false)
  })
})
