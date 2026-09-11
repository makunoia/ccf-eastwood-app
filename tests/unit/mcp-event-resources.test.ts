import { describe, expect, it } from "vitest"
import { committeeRoleSchema, occurrenceSchema, registrantInputSchema } from "@/lib/mcp/event-resources"

describe("MCP event resource schemas", () => {
  it("requires exactly one registrant identity", () => {
    expect(registrantInputSchema.safeParse({ eventId: "e", memberId: "m" }).success).toBe(true)
    expect(registrantInputSchema.safeParse({ eventId: "e", memberId: "m", guestId: "g" }).success).toBe(false)
    expect(registrantInputSchema.safeParse({ eventId: "e", firstName: "A" }).success).toBe(false)
  })

  it("requires payment reference for paid registrations", () => {
    expect(registrantInputSchema.safeParse({ eventId: "e", memberId: "m", isPaid: true }).success).toBe(false)
  })

  it("validates event ownership inputs", () => {
    expect(occurrenceSchema.safeParse({ eventId: "e", date: "2026-09-11T00:00:00Z" }).success).toBe(true)
    expect(committeeRoleSchema.safeParse({ eventId: "e", committeeId: "c", name: "Usher" }).success).toBe(true)
  })
})
