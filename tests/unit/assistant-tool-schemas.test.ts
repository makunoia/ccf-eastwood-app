import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { z } from "zod"
import {
  buildAssistantTools,
  buildToolApproval,
  WRITE_TOOL_NAMES,
} from "@/lib/assistant/tools"

const superAdminSession = {
  user: {
    id: "u1",
    username: "test-admin",
    role: "SuperAdmin",
    permissions: [],
    eventAccess: [],
    totpEnabled: false,
    mustChangePassword: false,
    requiresTotpSetup: false,
  },
} as unknown as Session

const tools = buildAssistantTools(superAdminSession)

function schemaOf(toolName: keyof typeof tools): z.ZodTypeAny {
  return tools[toolName].inputSchema as z.ZodTypeAny
}

describe("tool input schemas", () => {
  it("search_members accepts valid filters and rejects bad enums", () => {
    const schema = schemaOf("search_members")
    expect(schema.safeParse({ query: "Maria", gender: "Female", limit: 10 }).success).toBe(
      true
    )
    expect(schema.safeParse({ gender: "Other" }).success).toBe(false)
    expect(schema.safeParse({ limit: 500 }).success).toBe(false)
  })

  it("match_small_groups requires exactly one of guestId/memberId", () => {
    const schema = schemaOf("match_small_groups")
    expect(schema.safeParse({ guestId: "g1" }).success).toBe(true)
    expect(schema.safeParse({ memberId: "m1" }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ guestId: "g1", memberId: "m1" }).success).toBe(false)
  })

  it("create_member requires first and last name", () => {
    const schema = schemaOf("create_member")
    expect(schema.safeParse({ firstName: "Juan", lastName: "Dela Cruz" }).success).toBe(
      true
    )
    expect(schema.safeParse({ firstName: "Juan" }).success).toBe(false)
    expect(schema.safeParse({ firstName: "", lastName: "Dela Cruz" }).success).toBe(false)
  })

  it("update_member takes a partial patch", () => {
    const schema = schemaOf("update_member")
    expect(
      schema.safeParse({ memberId: "m1", patch: { phone: "09171234567" } }).success
    ).toBe(true)
    expect(schema.safeParse({ patch: { phone: "0917" } }).success).toBe(false)
  })

  it("mark_registrant_paid requires a non-empty payment reference", () => {
    const schema = schemaOf("mark_registrant_paid")
    expect(
      schema.safeParse({ eventId: "e1", registrantId: "r1", paymentReference: "GC-1" })
        .success
    ).toBe(true)
    expect(
      schema.safeParse({ eventId: "e1", registrantId: "r1", paymentReference: "" })
        .success
    ).toBe(false)
  })
})

describe("write-tool approval wiring", () => {
  it("every write tool exists in the tool map", () => {
    for (const name of WRITE_TOOL_NAMES) {
      expect(tools[name], `missing tool ${name}`).toBeDefined()
    }
  })

  it("buildToolApproval marks every write tool as user-approval", () => {
    const approval = buildToolApproval()
    expect(Object.keys(approval).sort()).toEqual([...WRITE_TOOL_NAMES].sort())
    expect(Object.values(approval).every((v) => v === "user-approval")).toBe(true)
  })

  it("no read tool is accidentally listed as a write tool", () => {
    const writeSet = new Set<string>(WRITE_TOOL_NAMES)
    const readTools = Object.keys(tools).filter((n) => !writeSet.has(n))
    expect(readTools).toContain("search_members")
    expect(readTools).toContain("get_event_attendance_stats")
    expect(readTools).not.toContain("create_member")
  })
})
