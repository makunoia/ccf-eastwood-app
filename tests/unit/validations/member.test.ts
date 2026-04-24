import { describe, it, expect } from "vitest"
import { memberSchema } from "@/lib/validations/member"

const VALID: Parameters<typeof memberSchema.safeParse>[0] = {
  firstName: "John",
  lastName: "Smith",
  email: "",
  phone: "",
  address: "",
  dateJoined: "2025-01-15",
  notes: "",
  lifeStageId: "",
  gender: "",
  language: [],
  birthMonth: "",
  birthYear: "",
  workCity: "",
  workIndustry: "",
  meetingPreference: "",
}

describe("memberSchema", () => {
  it("accepts minimal valid input", () => {
    const result = memberSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.firstName).toBe("John")
      expect(result.data.lastName).toBe("Smith")
    }
  })

  it("rejects empty firstName", () => {
    const result = memberSchema.safeParse({ ...VALID, firstName: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("First name is required")
  })

  it("rejects empty lastName", () => {
    const result = memberSchema.safeParse({ ...VALID, lastName: "" })
    expect(result.success).toBe(false)
  })

  it("rejects empty dateJoined", () => {
    const result = memberSchema.safeParse({ ...VALID, dateJoined: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Date joined is required")
  })

  it("transforms dateJoined string to a Date object", () => {
    const result = memberSchema.safeParse({ ...VALID, dateJoined: "2025-03-20" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.dateJoined).toBeInstanceOf(Date)
  })

  it("accepts a valid email", () => {
    const result = memberSchema.safeParse({ ...VALID, email: "john@example.com" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe("john@example.com")
  })

  it("rejects an invalid email", () => {
    const result = memberSchema.safeParse({ ...VALID, email: "bad-email" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Invalid email address")
  })

  it("transforms empty email to null", () => {
    const result = memberSchema.safeParse({ ...VALID, email: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBeNull()
  })

  it("transforms empty optional strings to null", () => {
    const result = memberSchema.safeParse({ ...VALID, phone: "", address: "", notes: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeNull()
      expect(result.data.address).toBeNull()
      expect(result.data.notes).toBeNull()
    }
  })

  it("accepts both gender values", () => {
    for (const gender of ["Male", "Female"]) {
      expect(memberSchema.safeParse({ ...VALID, gender }).success).toBe(true)
    }
  })

  it("rejects invalid gender", () => {
    expect(memberSchema.safeParse({ ...VALID, gender: "Nonbinary" }).success).toBe(false)
  })

  it("transforms empty gender to null", () => {
    const result = memberSchema.safeParse({ ...VALID, gender: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.gender == null).toBe(true)
  })

  it("accepts all meeting preference values", () => {
    for (const pref of ["Online", "Hybrid", "InPerson"]) {
      expect(memberSchema.safeParse({ ...VALID, meetingPreference: pref }).success).toBe(true)
    }
  })

  it("coerces string birthMonth to number", () => {
    const result = memberSchema.safeParse({ ...VALID, birthMonth: "4", birthYear: "1992" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.birthMonth).toBe(4)
      expect(result.data.birthYear).toBe(1992)
    }
  })

  it("transforms empty birthMonth / birthYear to null", () => {
    const result = memberSchema.safeParse({ ...VALID, birthMonth: "", birthYear: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.birthMonth).toBeNull()
      expect(result.data.birthYear).toBeNull()
    }
  })

  it("trims whitespace from name fields", () => {
    const result = memberSchema.safeParse({ ...VALID, firstName: "  John  ", lastName: "  Smith  " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.firstName).toBe("John")
      expect(result.data.lastName).toBe("Smith")
    }
  })
})
