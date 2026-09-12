import { describe, expect, it } from "vitest"
import type { McpActor } from "@/lib/mcp/auth"
import { actorCanWriteEvent } from "@/lib/mcp/auth"
import { MCP_BATCH_LIMIT } from "@/lib/mcp/mutations"

const actor = (overrides: Partial<McpActor> = {}): McpActor => ({
  id: "user_1",
  username: "staff",
  role: "Staff",
  scopes: new Set(["churchie:events:write"]),
  permissions: new Map([["Events", new Set(["Write"])]]) as McpActor["permissions"],
  eventAccess: new Set(["event_allowed"]),
  ...overrides,
})

describe("MCP mutations", () => {
  it("caps every semantic bulk operation at 100 records", () => {
    expect(MCP_BATCH_LIMIT).toBe(100)
  })

  it("requires both event write scope and live event access for a Staff write", () => {
    expect(actorCanWriteEvent(actor(), "event_allowed")).toBe(true)
    expect(actorCanWriteEvent(actor(), "event_other")).toBe(false)
    expect(actorCanWriteEvent(actor({ scopes: new Set(["churchie:events:read"]) }), "event_allowed")).toBe(false)
  })

  it("allows a Super Admin to write any event only with the write scope", () => {
    expect(actorCanWriteEvent(actor({ role: "SuperAdmin", eventAccess: new Set() }), "event_other")).toBe(true)
    expect(actorCanWriteEvent(actor({ role: "SuperAdmin", scopes: new Set() }), "event_other")).toBe(false)
  })
})
