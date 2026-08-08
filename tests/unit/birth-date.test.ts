import { describe, it, expect } from "vitest"
import {
  MIN_BIRTH_YEAR,
  birthYearMessage,
  isValidBirthYear,
  birthMonthSchema,
  birthYearSchema,
  optionalBirthYear,
} from "@/lib/validations/birth-date"
import { registrantSchema } from "@/lib/validations/event-registrant"
import { householdMemberSchema } from "@/lib/validations/household"

const NOW = new Date("2026-08-08T00:00:00Z")

describe("isValidBirthYear", () => {
  it("accepts the plausible window inclusive of both bounds", () => {
    expect(isValidBirthYear(MIN_BIRTH_YEAR, NOW)).toBe(true)
    expect(isValidBirthYear(1990, NOW)).toBe(true)
    expect(isValidBirthYear(2026, NOW)).toBe(true)
  })

  it("rejects a year older than the window, a future year, and a non-integer", () => {
    expect(isValidBirthYear(1899, NOW)).toBe(false)
    expect(isValidBirthYear(2027, NOW)).toBe(false)
    expect(isValidBirthYear(1990.5, NOW)).toBe(false)
  })

  it("rejects a half-typed year — the year input submits digits as they are typed", () => {
    expect(isValidBirthYear(1, NOW)).toBe(false)
    expect(isValidBirthYear(19, NOW)).toBe(false)
    expect(isValidBirthYear(199, NOW)).toBe(false)
  })
})

describe("birthYearMessage", () => {
  it("names both bounds so the message says what a good value looks like", () => {
    expect(birthYearMessage(NOW)).toBe(
      "Please enter a 4-digit birth year between 1900 and 2026."
    )
  })

  it("reads the upper bound at call time rather than at module load", () => {
    expect(birthYearMessage(new Date("2031-01-01T00:00:00Z"))).toContain("and 2031")
  })
})

describe("birth field schemas", () => {
  it("explains an out-of-range year instead of Zod's default 'Too small'", () => {
    const result = birthYearSchema.safeParse(1850)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(birthYearMessage())
    expect(result.error?.issues[0].message).not.toMatch(/too small/i)
  })

  it("uses the same sentence for every way of getting the year wrong", () => {
    for (const bad of [19, 1899, 3000, 1990.5]) {
      expect(birthYearSchema.safeParse(bad).error?.issues[0].message).toBe(birthYearMessage())
    }
  })

  it("explains an out-of-range month", () => {
    for (const bad of [0, 13]) {
      expect(birthMonthSchema.safeParse(bad).error?.issues[0].message).toBe(
        "Please select a valid birth month."
      )
    }
  })

  it("still treats a birthday as optional", () => {
    expect(optionalBirthYear.safeParse(null).success).toBe(true)
    expect(optionalBirthYear.safeParse(undefined).success).toBe(true)
    expect(optionalBirthYear.safeParse(1990).success).toBe(true)
  })
})

describe("registration payloads carry the readable message", () => {
  const base = { firstName: "Ana", lastName: "Cruz", birthMonth: 3 }

  it("registrantSchema — a year outside the window", () => {
    const result = registrantSchema.safeParse({ ...base, birthYear: 1850 })
    expect(result.success).toBe(false)
    // This is the exact string createRegistrant returns to the public form.
    expect(result.error?.issues[0].message).toBe(birthYearMessage())
  })

  it("householdMemberSchema — a year outside the window", () => {
    const result = householdMemberSchema.safeParse({
      ...base,
      role: "Child",
      birthYear: 1850,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(birthYearMessage())
    expect(result.error?.issues[0].path).toEqual(["birthYear"])
  })

  it("accepts a plausible birthday unchanged", () => {
    const result = registrantSchema.safeParse({ ...base, birthYear: 1990 })
    expect(result.success).toBe(true)
    expect(result.data?.birthYear).toBe(1990)
  })
})
