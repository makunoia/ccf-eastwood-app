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

async function connectedClient() {
  const server = createChurchieMcpServer(actor)
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
})
