import { describe, it, expect } from "vitest"
import { memberSchema } from "@/lib/validations/member"
import { guestSchema } from "@/lib/validations/guest"

/**
 * CCF-57: All birth year fields should use the standard YearInput component.
 *
 * This ticket standardises the year input across member, guest, and event
 * registrant forms. The masking logic (digits-only, max 4 chars) is now owned
 * by a single reusable component. These tests verify:
 *  1. The YearInput masking behaviour (pure logic)
 *  2. The Zod schema still accepts and transforms birthYear strings correctly
 *     (regression — the schema is the downstream consumer of the field value)
 */

/** Mirrors the filtering logic inside YearInput.handleChange */
function filterYearInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4)
}

describe("CCF-57 – YearInput masking logic", () => {
  describe("unit – digit filtering", () => {
    it("keeps only numeric characters", () => {
      expect(filterYearInput("19ab")).toBe("19")
      expect(filterYearInput("abc!")).toBe("")
      expect(filterYearInput("1990")).toBe("1990")
    })

    it("strips leading/trailing non-digit characters", () => {
      expect(filterYearInput(" 2000 ")).toBe("2000")
      expect(filterYearInput("__1985__")).toBe("1985")
    })

    it("truncates to 4 characters", () => {
      expect(filterYearInput("19901")).toBe("1990")
      expect(filterYearInput("200012")).toBe("2000")
    })

    it("handles an empty string", () => {
      expect(filterYearInput("")).toBe("")
    })

    it("handles a paste of a full year with surrounding text", () => {
      expect(filterYearInput("Born: 1990")).toBe("1990")
    })
  })

  describe("regression – memberSchema accepts birthYear string", () => {
    const baseValid = {
      firstName: "James",
      lastName: "Reyes",
      dateJoined: "2024-01-01",
    }

    it("transforms a 4-digit string to an integer", () => {
      const result = memberSchema.safeParse({ ...baseValid, birthYear: "1990" })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.birthYear).toBe(1990)
    })

    it("transforms an empty string to null", () => {
      const result = memberSchema.safeParse({ ...baseValid, birthYear: "" })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.birthYear).toBeNull()
    })

    it("transforms undefined to null", () => {
      const result = memberSchema.safeParse({ ...baseValid, birthYear: undefined })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.birthYear).toBeNull()
    })
  })

  describe("regression – guestSchema accepts birthYear string", () => {
    const baseValid = {
      firstName: "Ana",
      lastName: "Cruz",
    }

    it("transforms a 4-digit string to an integer", () => {
      const result = guestSchema.safeParse({ ...baseValid, birthYear: "2001" })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.birthYear).toBe(2001)
    })

    it("transforms an empty string to null", () => {
      const result = guestSchema.safeParse({ ...baseValid, birthYear: "" })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.birthYear).toBeNull()
    })
  })
})
