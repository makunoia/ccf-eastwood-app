import { describe, it, expect } from "vitest"
import { parse24, to24, formatDisplay } from "@/components/ui/time-input"

describe("CCF-88 — TimeInput helpers", () => {
  describe("parse24", () => {
    it("parses midnight as 12:00 am", () => {
      expect(parse24("00:00")).toEqual({ digits: "1200", period: "am" })
    })

    it("parses noon as 12:00 pm", () => {
      expect(parse24("12:00")).toEqual({ digits: "1200", period: "pm" })
    })

    it("parses afternoon hour correctly", () => {
      expect(parse24("14:30")).toEqual({ digits: "0230", period: "pm" })
    })

    it("parses morning hour correctly", () => {
      expect(parse24("09:15")).toEqual({ digits: "0915", period: "am" })
    })

    it("parses 23:59 as 11:59 pm", () => {
      expect(parse24("23:59")).toEqual({ digits: "1159", period: "pm" })
    })

    it("returns empty digits for invalid input", () => {
      expect(parse24("")).toEqual({ digits: "", period: "am" })
      expect(parse24("invalid")).toEqual({ digits: "", period: "am" })
    })
  })

  describe("to24", () => {
    it("converts 12:00 am → 00:00 (midnight)", () => {
      expect(to24("1200", "am")).toBe("00:00")
    })

    it("converts 12:00 pm → 12:00 (noon)", () => {
      expect(to24("1200", "pm")).toBe("12:00")
    })

    it("converts pm hour correctly", () => {
      expect(to24("0230", "pm")).toBe("14:30")
    })

    it("converts am hour correctly", () => {
      expect(to24("0915", "am")).toBe("09:15")
    })

    it("returns empty string for incomplete digits", () => {
      expect(to24("", "am")).toBe("")
      expect(to24("123", "pm")).toBe("")
    })

    it("returns empty string for out-of-range values", () => {
      expect(to24("0060", "am")).toBe("") // mins > 59
      expect(to24("0000", "am")).toBe("") // hours = 0 in 12hr is invalid
      expect(to24("1360", "pm")).toBe("") // hours > 12
      expect(to24("1300", "pm")).toBe("") // regression: 13 is not a valid 12-hour hour
    })
  })

  describe("formatDisplay", () => {
    it("shows underscores for missing digits", () => {
      expect(formatDisplay("")).toBe("__:__")
      expect(formatDisplay("1")).toBe("1_:__")
      expect(formatDisplay("12")).toBe("12:__")
      expect(formatDisplay("123")).toBe("12:3_")
    })

    it("shows full time when 4 digits are present", () => {
      expect(formatDisplay("1230")).toBe("12:30")
      expect(formatDisplay("0915")).toBe("09:15")
    })
  })

  describe("round-trip: parse24 → to24", () => {
    const cases = ["00:00", "12:00", "09:15", "14:30", "23:59", "01:01"]
    for (const time of cases) {
      it(`round-trips ${time}`, () => {
        const { digits, period } = parse24(time)
        expect(to24(digits, period)).toBe(time)
      })
    }
  })
})
