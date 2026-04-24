import { describe, it, expect } from "vitest"
import { guestSchema } from "@/lib/validations/guest"

const VALID: Parameters<typeof guestSchema.safeParse>[0] = {
  firstName: "Jane",
  lastName: "Doe",
  email: "",
  phone: "",
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

describe("guestSchema", () => {
  it("accepts minimal valid input (name only)", () => {
    const result = guestSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.firstName).toBe("Jane")
      expect(result.data.lastName).toBe("Doe")
    }
  })

  it("rejects empty firstName", () => {
    const result = guestSchema.safeParse({ ...VALID, firstName: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("First name is required")
  })

  it("rejects empty lastName", () => {
    const result = guestSchema.safeParse({ ...VALID, lastName: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Last name is required")
  })

  it("trims whitespace from name fields", () => {
    const result = guestSchema.safeParse({ ...VALID, firstName: "  Jane  ", lastName: "  Doe  " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.firstName).toBe("Jane")
      expect(result.data.lastName).toBe("Doe")
    }
  })

  it("accepts a valid email", () => {
    const result = guestSchema.safeParse({ ...VALID, email: "jane@example.com" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe("jane@example.com")
  })

  it("rejects an invalid email", () => {
    const result = guestSchema.safeParse({ ...VALID, email: "not-an-email" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Invalid email address")
  })

  it("transforms empty email string to null", () => {
    const result = guestSchema.safeParse({ ...VALID, email: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBeNull()
  })

  it("transforms empty optional strings to null", () => {
    const result = guestSchema.safeParse({ ...VALID, phone: "", notes: "", workCity: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeNull()
      expect(result.data.notes).toBeNull()
      expect(result.data.workCity).toBeNull()
    }
  })

  it("accepts valid gender values", () => {
    for (const gender of ["Male", "Female"]) {
      const result = guestSchema.safeParse({ ...VALID, gender })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid gender value", () => {
    const result = guestSchema.safeParse({ ...VALID, gender: "Other" })
    expect(result.success).toBe(false)
  })

  it("transforms empty gender string to undefined/null", () => {
    const result = guestSchema.safeParse({ ...VALID, gender: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.gender == null).toBe(true)
  })

  it("accepts all valid meetingPreference values", () => {
    for (const pref of ["Online", "Hybrid", "InPerson"]) {
      const result = guestSchema.safeParse({ ...VALID, meetingPreference: pref })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid meetingPreference", () => {
    const result = guestSchema.safeParse({ ...VALID, meetingPreference: "Virtual" })
    expect(result.success).toBe(false)
  })

  it("coerces string birthMonth and birthYear to numbers", () => {
    const result = guestSchema.safeParse({ ...VALID, birthMonth: "6", birthYear: "1995" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.birthMonth).toBe(6)
      expect(result.data.birthYear).toBe(1995)
    }
  })

  it("transforms empty birthMonth / birthYear to null", () => {
    const result = guestSchema.safeParse({ ...VALID, birthMonth: "", birthYear: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.birthMonth).toBeNull()
      expect(result.data.birthYear).toBeNull()
    }
  })

  it("accepts numeric birthMonth and birthYear", () => {
    const result = guestSchema.safeParse({ ...VALID, birthMonth: 3, birthYear: 1990 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.birthMonth).toBe(3)
      expect(result.data.birthYear).toBe(1990)
    }
  })

  it("defaults language to empty array when not provided", () => {
    const { language: _, ...withoutLanguage } = VALID
    const result = guestSchema.safeParse(withoutLanguage)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.language).toEqual([])
  })
})
