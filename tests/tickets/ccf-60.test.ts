import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import { createGuest, updateGuest } from "@/app/(dashboard)/guests/actions"
import { createMember, updateMember } from "@/app/(dashboard)/members/actions"
import { getDuplicateProfiles } from "@/app/(dashboard)/settings/duplicate-profiles/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "LifeStage", "SmallGroup" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedMember(overrides: { phone?: string | null; email?: string | null } = {}) {
  return db.member.create({
    data: {
      firstName: "Juan",
      lastName: "dela Cruz",
      dateJoined: new Date(),
      language: [],
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
    },
  })
}

async function seedGuest(overrides: { phone?: string | null; email?: string | null } = {}) {
  return db.guest.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      language: [],
      phone: overrides.phone ?? null,
      email: overrides.email ?? null,
    },
  })
}

describe("CCF-60: Prevent duplicate phone/email across Guest and Member profiles", () => {
  describe("unit: checkDuplicateContactInfo", () => {
    it("returns no conflict when phone and email are unique", async () => {
      const result = await checkDuplicateContactInfo({ phone: "09171234567", email: "test@example.com" })
      expect(result.conflict).toBe(false)
    })

    it("detects phone conflict with an existing Member", async () => {
      await seedMember({ phone: "09171234567" })
      const result = await checkDuplicateContactInfo({ phone: "09171234567" })
      expect(result.conflict).toBe(true)
      if (result.conflict) {
        expect(result.message).toContain("09171234567")
        expect(result.message).toContain("Member")
      }
    })

    it("detects phone conflict with an existing active Guest", async () => {
      await seedGuest({ phone: "09179876543" })
      const result = await checkDuplicateContactInfo({ phone: "09179876543" })
      expect(result.conflict).toBe(true)
      if (result.conflict) {
        expect(result.message).toContain("Guest")
      }
    })

    it("does not flag a promoted guest's phone as a conflict", async () => {
      const member = await seedMember({ phone: "09171111111" })
      await db.guest.create({
        data: {
          firstName: "Old",
          lastName: "Guest",
          language: [],
          phone: "09171111111",
          memberId: member.id,
        },
      })
      // The promoted guest (memberId set) should not cause a conflict
      const result = await checkDuplicateContactInfo({ phone: "09171111111", excludeMemberId: member.id })
      expect(result.conflict).toBe(false)
    })

    it("excludes current member from its own phone check on update", async () => {
      const m = await seedMember({ phone: "09172222222" })
      const result = await checkDuplicateContactInfo({ phone: "09172222222", excludeMemberId: m.id })
      expect(result.conflict).toBe(false)
    })

    it("excludes current guest from its own phone check on update", async () => {
      const g = await seedGuest({ phone: "09173333333" })
      const result = await checkDuplicateContactInfo({ phone: "09173333333", excludeGuestId: g.id })
      expect(result.conflict).toBe(false)
    })

    it("detects email conflict case-insensitively", async () => {
      await seedMember({ email: "User@Example.com" })
      const result = await checkDuplicateContactInfo({ email: "user@example.com" })
      expect(result.conflict).toBe(true)
      if (result.conflict) {
        expect(result.message).toContain("Member")
      }
    })

    it("returns no conflict when neither phone nor email provided", async () => {
      const result = await checkDuplicateContactInfo({})
      expect(result.conflict).toBe(false)
    })
  })

  describe("integration: createGuest blocks duplicate contact info", () => {
    it("rejects a new guest with a phone already used by a Member", async () => {
      // Members are stored with a canonical phone; createGuest normalizes its
      // input the same way before the duplicate check runs.
      await seedMember({ phone: "+63 917 123 4567" })
      const result = await createGuest({
        firstName: "New",
        lastName: "Guest",
        phone: "09171234567",
        email: "",
        language: [],
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(false)
      // The duplicate-check message echoes the normalized phone.
      if (!result.success) expect(result.error).toContain("+63 917 123 4567")
    })

    it("rejects a new guest with an email already used by a Guest", async () => {
      await seedGuest({ email: "existing@example.com" })
      const result = await createGuest({
        firstName: "Another",
        lastName: "Person",
        phone: "",
        email: "existing@example.com",
        language: [],
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(false)
    })

    it("allows a guest with no phone/email overlap", async () => {
      await seedMember({ phone: "09171111111" })
      const result = await createGuest({
        firstName: "New",
        lastName: "Guest",
        phone: "09172222222",
        email: "",
        language: [],
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("integration: createMember blocks duplicate contact info", () => {
    it("rejects a new member with a phone already used by a Guest", async () => {
      // Guests are stored canonical; createMember normalizes its input the same
      // way before the duplicate check runs.
      await seedGuest({ phone: "+63 917 555 5555" })
      const result = await createMember({
        firstName: "New",
        lastName: "Member",
        phone: "09175555555",
        email: "",
        dateJoined: new Date().toISOString().split("T")[0],
        language: [],
        address: "",
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain("Guest")
    })
  })

  describe("integration: updateGuest allows own contact info", () => {
    it("allows updating a guest without changing their own phone", async () => {
      const g = await seedGuest({ phone: "09176666666" })
      const result = await updateGuest(g.id, {
        firstName: "Maria",
        lastName: "Updated",
        phone: "09176666666",
        email: "",
        language: [],
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("integration: updateMember allows own contact info", () => {
    it("allows updating a member without changing their own email", async () => {
      const m = await seedMember({ email: "same@example.com" })
      const result = await updateMember(m.id, {
        firstName: "Juan",
        lastName: "Updated",
        phone: "",
        email: "same@example.com",
        dateJoined: new Date().toISOString().split("T")[0],
        language: [],
        address: "",
        notes: "",
        lifeStageId: "",
        gender: "",
        birthMonth: "",
        birthYear: "",
        ageRangeBucketId: "",
        workCity: "",
        workIndustry: "",
        meetingPreference: "",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("integration: getDuplicateProfiles report", () => {
    it("returns empty array when no duplicates exist", async () => {
      await seedMember({ phone: "09171111111", email: "a@example.com" })
      await seedGuest({ phone: "09172222222", email: "b@example.com" })
      const result = await getDuplicateProfiles()
      expect(result.success).toBe(true)
      if (result.success) expect(result.data).toHaveLength(0)
    })

    it("detects a phone shared between a Member and a Guest", async () => {
      await seedMember({ phone: "09179999999" })
      await seedGuest({ phone: "09179999999" })
      const result = await getDuplicateProfiles()
      expect(result.success).toBe(true)
      if (result.success) {
        const phoneDup = result.data.find((g) => g.field === "phone" && g.value === "09179999999")
        expect(phoneDup).toBeDefined()
        expect(phoneDup?.records).toHaveLength(2)
      }
    })

    it("detects an email shared between two Guests", async () => {
      await seedGuest({ email: "shared@example.com" })
      await db.guest.create({
        data: { firstName: "Pedro", lastName: "Reyes", language: [], email: "shared@example.com" },
      })
      const result = await getDuplicateProfiles()
      expect(result.success).toBe(true)
      if (result.success) {
        const emailDup = result.data.find(
          (g) => g.field === "email" && g.value === "shared@example.com"
        )
        expect(emailDup).toBeDefined()
        expect(emailDup?.records.every((r) => r.recordType === "guest")).toBe(true)
      }
    })

    it("does not include promoted guests in duplicate detection", async () => {
      const member = await seedMember({ phone: "09178888888" })
      // Promoted guest — same phone, should be excluded
      await db.guest.create({
        data: { firstName: "Old", lastName: "Guest", language: [], phone: "09178888888", memberId: member.id },
      })
      const result = await getDuplicateProfiles()
      expect(result.success).toBe(true)
      if (result.success) {
        const phoneDup = result.data.find((g) => g.field === "phone" && g.value === "09178888888")
        expect(phoneDup).toBeUndefined()
      }
    })
  })

  describe("regression", () => {
    it("checkDuplicateContactInfo cross-table: same phone in both tables triggers conflict", async () => {
      await seedMember({ phone: "09170000001" })
      const result = await checkDuplicateContactInfo({ phone: "09170000001" })
      expect(result.conflict).toBe(true)
    })

    it("checkDuplicateContactInfo cross-table: same email in both tables triggers conflict", async () => {
      await seedGuest({ email: "conflict@example.com" })
      const result = await checkDuplicateContactInfo({ email: "conflict@example.com" })
      expect(result.conflict).toBe(true)
    })
  })
})
