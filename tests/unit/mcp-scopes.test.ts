import { describe, expect, it } from "vitest"
import { parseScopes, sanitizeRequestedScopes, scopeAllows } from "@/lib/mcp/scopes"

describe("MCP scopes", () => {
  it("allows only the matching feature and action scope", () => {
    const scopes = parseScopes("churchie:small-groups:read churchie:small-groups:import")
    expect(scopeAllows(scopes, "SmallGroups", "Read")).toBe(true)
    expect(scopeAllows(scopes, "SmallGroups", "Import")).toBe(true)
    expect(scopeAllows(scopes, "SmallGroups", "Write")).toBe(false)
    expect(scopeAllows(scopes, "Members", "Read")).toBe(false)
  })

  it("rejects unknown and empty scope requests", () => {
    expect(sanitizeRequestedScopes("churchie:small-groups:read")).toEqual(["churchie:small-groups:read"])
    expect(sanitizeRequestedScopes("churchie:all")).toBeNull()
    expect(sanitizeRequestedScopes(null)).toBeNull()
  })
})
