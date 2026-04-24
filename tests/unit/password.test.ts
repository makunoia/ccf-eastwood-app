import { describe, it, expect } from "vitest"
import { generatePassword } from "@/lib/password"

// Characters excluded from the charset to avoid visual ambiguity
const AMBIGUOUS = /[0OIl1]/

describe("generatePassword", () => {
  it("generates a password of the default length (16)", () => {
    expect(generatePassword()).toHaveLength(16)
  })

  it("generates a password of the requested custom length", () => {
    expect(generatePassword(8)).toHaveLength(8)
    expect(generatePassword(32)).toHaveLength(32)
  })

  it("never includes visually ambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePassword()).not.toMatch(AMBIGUOUS)
    }
  })

  it("returns unique values across repeated calls", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()))
    // In practice all 50 should be unique; allow 1 collision as an extremely rare coincidence
    expect(passwords.size).toBeGreaterThanOrEqual(49)
  })

  it("only contains characters from the allowed charset", () => {
    const ALLOWED = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*]+$/
    for (let i = 0; i < 20; i++) {
      expect(generatePassword()).toMatch(ALLOWED)
    }
  })
})
