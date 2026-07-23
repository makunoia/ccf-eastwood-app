import { describe, it, expect } from "vitest"
import {
  familySchema,
  familyMemberSchema,
  FAMILY_ROLE_LABELS,
} from "@/lib/validations/family"

describe("familySchema", () => {
  it("requires a non-empty name", () => {
    expect(familySchema.safeParse({ name: "" }).success).toBe(false)
    expect(familySchema.safeParse({ name: "Dela Cruz Family" }).success).toBe(true)
  })

  it("normalizes empty notes to null", () => {
    const parsed = familySchema.parse({ name: "Reyes Family", notes: "" })
    expect(parsed.notes).toBeNull()
  })

  it("trims name and notes", () => {
    const parsed = familySchema.parse({ name: "  Reyes Family  ", notes: "  hi  " })
    expect(parsed.name).toBe("Reyes Family")
    expect(parsed.notes).toBe("hi")
  })
})

describe("familyMemberSchema", () => {
  it("accepts exactly one of memberId / guestId", () => {
    expect(
      familyMemberSchema.safeParse({ memberId: "m1", role: "FatherHusband" }).success
    ).toBe(true)
    expect(
      familyMemberSchema.safeParse({ guestId: "g1", role: "Child" }).success
    ).toBe(true)
  })

  it("rejects both memberId and guestId set", () => {
    expect(
      familyMemberSchema.safeParse({ memberId: "m1", guestId: "g1", role: "FatherHusband" })
        .success
    ).toBe(false)
  })

  it("rejects neither set (including empty strings)", () => {
    expect(familyMemberSchema.safeParse({ role: "MotherWife" }).success).toBe(false)
    expect(
      familyMemberSchema.safeParse({ memberId: "", guestId: "", role: "MotherWife" })
        .success
    ).toBe(false)
  })

  it("rejects unknown roles", () => {
    expect(
      familyMemberSchema.safeParse({ memberId: "m1", role: "Cousin" }).success
    ).toBe(false)
  })

  it("labels the spouse roles as Father/Husband and Mother/Wife", () => {
    expect(FAMILY_ROLE_LABELS.FatherHusband).toBe("Father/Husband")
    expect(FAMILY_ROLE_LABELS.MotherWife).toBe("Mother/Wife")
  })
})
