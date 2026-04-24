import { describe, it, expect, vi, afterEach } from "vitest"

// Set before importing the module so getSecret() can read it
process.env.AUTH_SECRET = "test-secret-for-unit-tests-only"

import { signPreAuthToken, verifyPreAuthToken } from "@/lib/auth-tokens"

afterEach(() => {
  vi.useRealTimers()
  process.env.AUTH_SECRET = "test-secret-for-unit-tests-only"
})

describe("signPreAuthToken / verifyPreAuthToken", () => {
  it("round-trips: a freshly signed token verifies to the original userId", () => {
    const userId = "user-abc-123"
    const token = signPreAuthToken(userId)
    expect(verifyPreAuthToken(token)).toBe(userId)
  })

  it("returns null for a token whose signature has been tampered", () => {
    const token = signPreAuthToken("user-1")
    const parts = token.split(":")
    const tampered = `${parts[0]}:${parts[1]}:deadbeef`
    expect(verifyPreAuthToken(tampered)).toBeNull()
  })

  it("returns null for a token with too few parts", () => {
    expect(verifyPreAuthToken("only:two")).toBeNull()
  })

  it("returns null for a token with too many parts", () => {
    expect(verifyPreAuthToken("a:b:c:d")).toBeNull()
  })

  it("returns null for an expired token (past 5-minute window)", () => {
    vi.useFakeTimers()
    const token = signPreAuthToken("user-1")
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(verifyPreAuthToken(token)).toBeNull()
  })

  it("accepts a token just within the 5-minute window", () => {
    vi.useFakeTimers()
    const token = signPreAuthToken("user-1")
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(verifyPreAuthToken(token)).toBe("user-1")
  })

  it("returns null for an empty string", () => {
    expect(verifyPreAuthToken("")).toBeNull()
  })

  it("throws if AUTH_SECRET is missing when signing", () => {
    delete process.env.AUTH_SECRET
    expect(() => signPreAuthToken("user-1")).toThrow("AUTH_SECRET is not set")
  })
})
