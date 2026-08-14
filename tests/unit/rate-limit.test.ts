/**
 * CCF-147 — the fixed-window limiter guarding the public profile lookup.
 *
 * `now` is injected everywhere rather than faking timers, so these assert the
 * window arithmetic directly.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  checkRateLimit,
  clientIpFrom,
  resetRateLimits,
  UNKNOWN_IP_BUCKET,
} from "@/lib/security/rate-limit"

beforeEach(() => {
  resetRateLimits()
})

const OPTS = { limit: 3, windowMs: 60_000 }

describe("checkRateLimit", () => {
  it("allows up to the limit and refuses the next call", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("ip", { ...OPTS, now: 1_000 }).allowed).toBe(true)
    }
    const blocked = checkRateLimit("ip", { ...OPTS, now: 1_000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(60_000)
  })

  it("reports the time left in the window, not the whole window", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("ip", { ...OPTS, now: 1_000 })
    const blocked = checkRateLimit("ip", { ...OPTS, now: 41_000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(20_000)
  })

  it("starts a fresh window once the old one has elapsed", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("ip", { ...OPTS, now: 1_000 })
    // resetAt is an exclusive end: the last blocked millisecond is 60_999.
    expect(checkRateLimit("ip", { ...OPTS, now: 60_999 }).allowed).toBe(false)
    expect(checkRateLimit("ip", { ...OPTS, now: 61_000 }).allowed).toBe(true)
  })

  it("counts each key independently", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", { ...OPTS, now: 1_000 })
    expect(checkRateLimit("a", { ...OPTS, now: 1_000 }).allowed).toBe(false)
    expect(checkRateLimit("b", { ...OPTS, now: 1_000 }).allowed).toBe(true)
  })

  it("does not consume budget once blocked — a blocked caller can't extend its own window", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("ip", { ...OPTS, now: 1_000 })
    expect(checkRateLimit("ip", { ...OPTS, now: 30_000 }).allowed).toBe(false)
    expect(checkRateLimit("ip", { ...OPTS, now: 50_000 }).allowed).toBe(false)
    // The window still ends where the *first* call put it, not where the last
    // rejected one did — otherwise hammering the endpoint would extend the block
    // indefinitely and lock out the legitimate retry.
    expect(checkRateLimit("ip", { ...OPTS, now: 61_000 }).allowed).toBe(true)
  })
})

describe("clientIpFrom", () => {
  const headersOf = (h: Record<string, string>) => ({
    get: (name: string) => h[name] ?? null,
  })

  it("takes the left-most entry of x-forwarded-for", () => {
    expect(
      clientIpFrom(headersOf({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))
    ).toBe("203.0.113.7")
  })

  it("trims whitespace", () => {
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7")
  })

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(headersOf({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4")
  })

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      clientIpFrom(headersOf({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }))
    ).toBe("203.0.113.7")
  })

  it("buckets an unknown origin rather than exempting it", () => {
    expect(clientIpFrom(headersOf({}))).toBe(UNKNOWN_IP_BUCKET)
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "" }))).toBe(UNKNOWN_IP_BUCKET)
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "  ," }))).toBe(UNKNOWN_IP_BUCKET)
  })
})
