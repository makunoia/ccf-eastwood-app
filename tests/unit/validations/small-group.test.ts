import { describe, it, expect } from "vitest"
import { smallGroupSchema } from "@/lib/validations/small-group"

const VALID: Parameters<typeof smallGroupSchema.safeParse>[0] = {
  name: "Young Professionals",
  leaderId: "member-abc",
  parentGroupId: "",
  lifeStageId: "ls-1",
  genderFocus: "Mixed",
  language: [],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "Hybrid",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "6",
  scheduleTimeStart: "09:00",
}

describe("smallGroupSchema", () => {
  it("accepts a fully valid input", () => {
    expect(smallGroupSchema.safeParse(VALID).success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, name: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Group name is required")
  })

  it("rejects empty leaderId", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, leaderId: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Leader is required")
  })

  it("rejects empty lifeStageId", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, lifeStageId: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Life stage is required")
  })

  it("accepts all valid genderFocus values", () => {
    for (const focus of ["Male", "Female", "Mixed"]) {
      expect(smallGroupSchema.safeParse({ ...VALID, genderFocus: focus }).success).toBe(true)
    }
  })

  it("rejects invalid genderFocus", () => {
    expect(smallGroupSchema.safeParse({ ...VALID, genderFocus: "Other" }).success).toBe(false)
  })

  it("accepts all valid meetingFormat values", () => {
    for (const format of ["Online", "Hybrid", "InPerson"]) {
      expect(smallGroupSchema.safeParse({ ...VALID, meetingFormat: format }).success).toBe(true)
    }
  })

  it("rejects invalid meetingFormat", () => {
    expect(smallGroupSchema.safeParse({ ...VALID, meetingFormat: "Virtual" }).success).toBe(false)
  })

  it("transforms empty parentGroupId to null", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, parentGroupId: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.parentGroupId).toBeNull()
  })

  it("parses scheduleDayOfWeek from string to integer", () => {
    for (let day = 0; day <= 6; day++) {
      const result = smallGroupSchema.safeParse({ ...VALID, scheduleDayOfWeek: String(day) })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.scheduleDayOfWeek).toBe(day)
    }
  })

  it("rejects scheduleDayOfWeek out of 0–6 range", () => {
    expect(smallGroupSchema.safeParse({ ...VALID, scheduleDayOfWeek: "7" }).success).toBe(false)
  })

  it("rejects missing scheduleDayOfWeek", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, scheduleDayOfWeek: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Meeting day is required")
  })

  it("rejects scheduleTimeStart without leading zero (not HH:MM)", () => {
    expect(smallGroupSchema.safeParse({ ...VALID, scheduleTimeStart: "9:00" }).success).toBe(false)
  })

  it("accepts valid HH:MM scheduleTimeStart values", () => {
    for (const time of ["00:00", "09:30", "14:00", "23:59"]) {
      expect(smallGroupSchema.safeParse({ ...VALID, scheduleTimeStart: time }).success).toBe(true)
    }
  })

  it("rejects missing scheduleTimeStart", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, scheduleTimeStart: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Meeting time is required")
  })

  it("transforms empty memberLimit to null", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, memberLimit: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.memberLimit).toBeNull()
  })

  it("parses memberLimit from string to integer", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, memberLimit: "15" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.memberLimit).toBe(15)
  })

  it("rejects non-positive memberLimit", () => {
    expect(smallGroupSchema.safeParse({ ...VALID, memberLimit: "0" }).success).toBe(false)
  })

  it("transforms empty ageRangeMin / ageRangeMax to null", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, ageRangeMin: "", ageRangeMax: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ageRangeMin).toBeNull()
      expect(result.data.ageRangeMax).toBeNull()
    }
  })

  it("trims whitespace from name", () => {
    const result = smallGroupSchema.safeParse({ ...VALID, name: "  My Group  " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe("My Group")
  })
})
