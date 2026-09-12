import { afterEach, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createChurchieMcpServer } from "@/lib/mcp/server"
import type { McpActor } from "@/lib/mcp/auth"

const actor: McpActor = {
  id: "admin_1",
  username: "admin",
  role: "SuperAdmin",
  scopes: new Set([
    "churchie:members:read", "churchie:members:write", "churchie:guests:read", "churchie:guests:write",
    "churchie:small-groups:read", "churchie:small-groups:write", "churchie:small-groups:import",
    "churchie:ministries:read", "churchie:ministries:write", "churchie:events:read", "churchie:events:write",
    "churchie:volunteers:read", "churchie:volunteers:write",
  ]),
  permissions: new Map(),
  eventAccess: new Set(),
}

const close: Array<() => Promise<void>> = []
afterEach(async () => { await Promise.all(close.splice(0).map((fn) => fn())) })

async function connectedClient(clientActor: McpActor = actor) {
  const server = createChurchieMcpServer(clientActor)
  const client = new Client({ name: "contract-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  close.push(() => client.close(), () => server.close())
  return client
}

describe("Churchie MCP contract", () => {
  it("marks every delete and bulk tool destructive and every search/get tool read-only", async () => {
    const tools = (await (await connectedClient()).listTools()).tools
    for (const tool of tools.filter((item) => item.name.startsWith("delete_") || item.name.startsWith("bulk_") || item.name === "remove_family_member")) {
      expect(tool.annotations?.destructiveHint, tool.name).toBe(true)
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(false)
    }
    for (const tool of tools.filter((item) => item.name.startsWith("search_") || item.name.startsWith("get_"))) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
    }
  })

  it("advertises the MCP Apps workbook resource on the import tool", async () => {
    const client = await connectedClient()
    const tools = (await client.listTools()).tools
    for (const name of ["create_event_registrant", "update_event_registrant", "delete_event_registrant", "create_event_occurrence", "update_event_occurrence", "delete_event_occurrence", "create_event_committee", "delete_event_committee", "create_committee_role", "delete_committee_role"]) {
      expect(tools.some((tool) => tool.name === name), name).toBe(true)
    }
    const start = tools.find((tool) => tool.name === "start_dgroup_workbook_import")
    expect(tools.some((tool) => tool.name === "confirm_dgroup_import_review")).toBe(true)
    expect(start?._meta?.ui).toEqual({ resourceUri: "ui://churchie/dgroup-import-v1.html" })
    const resources = await client.listResources()
    expect(resources.resources.some((resource) => resource.uri === "ui://churchie/dgroup-import-v1.html")).toBe(true)
  })

  it("publishes rich, permission-aware lookup and operational tools", async () => {
    const tools = (await (await connectedClient()).listTools()).tools
    const names = tools.map((tool) => tool.name)
    for (const name of [
      "list_life_stages",
      "get_member",
      "get_guest",
      "check_duplicate_contact",
      "match_dgroups",
      "get_dgroup_stats",
      "search_dgroup_requests",
      "get_ministry",
      "get_event_attendance_stats",
      "list_event_sessions",
      "get_volunteer",
      "get_family",
      "get_entity_counts",
      "resolve_dgroup_request",
      "target_dgroup_request",
      "set_event_attendance",
      "set_event_session_checkin",
      "set_event_registrant_payment",
    ]) {
      expect(names, name).toContain(name)
    }

    const eventSearch = tools.find((tool) => tool.name === "search_events")
    expect(eventSearch?.inputSchema.properties).toMatchObject({
      type: expect.any(Object),
      ministryId: expect.any(Object),
      startDateFrom: expect.any(Object),
      startDateTo: expect.any(Object),
    })
    const memberSearch = tools.find((tool) => tool.name === "search_members")
    expect(memberSearch?.inputSchema.properties).toMatchObject({
      lifeStageId: expect.any(Object),
      gender: expect.any(Object),
      inSmallGroup: expect.any(Object),
    })

    for (const name of ["list_life_stages", "match_dgroups", "list_event_sessions"]) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, name).toBe(true)
    }
    for (const name of ["resolve_dgroup_request", "target_dgroup_request", "set_event_attendance", "set_event_session_checkin", "set_event_registrant_payment"]) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, name).toBe(false)
    }
  })

  it("prunes unavailable mutations from a scoped Staff tool catalog", async () => {
    const staff: McpActor = {
      id: "staff_1",
      username: "staff",
      role: "Staff",
      scopes: new Set(["churchie:events:read", "churchie:events:write"]),
      permissions: new Map([["Events", new Set(["Write"])]]),
      eventAccess: new Set(["event_1"]),
    }
    const names = (await (await connectedClient(staff)).listTools()).tools.map((tool) => tool.name)
    expect(names).toContain("update_event")
    expect(names).toContain("set_event_attendance")
    expect(names).not.toContain("create_event")
    expect(names).not.toContain("create_member")
    expect(names).not.toContain("create_event_committee")
    expect(names.some((name) => name.startsWith("delete_"))).toBe(false)
    expect(names.some((name) => name.startsWith("bulk_"))).toBe(false)
  })
})
