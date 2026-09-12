import { beforeEach, describe, expect, it } from "vitest"
import { consumeMcpRateLimit, resetMcpRateLimitsForTests } from "@/lib/mcp/rate-limit"

describe("MCP rate limiter", () => {
  beforeEach(resetMcpRateLimitsForTests)
  it("allows the configured quota then returns a retry delay", () => {
    expect(consumeMcpRateLimit("token", 2, 1000, 0).allowed).toBe(true)
    expect(consumeMcpRateLimit("token", 2, 1000, 1).allowed).toBe(true)
    const denied = consumeMcpRateLimit("token", 2, 1000, 2)
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfter).toBe(1)
  })
  it("resets after the window", () => {
    consumeMcpRateLimit("token", 1, 1000, 0)
    expect(consumeMcpRateLimit("token", 1, 1000, 1000).allowed).toBe(true)
  })
})
