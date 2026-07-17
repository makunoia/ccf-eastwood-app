import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import {
  DEFAULT_ROW_LIMIT,
  MAX_ROW_LIMIT,
  clampRowLimit,
} from "@/lib/assistant/config"
import { buildSystemPrompt, manilaToday } from "@/lib/assistant/system-prompt"

describe("clampRowLimit", () => {
  it("defaults when no limit given", () => {
    expect(clampRowLimit()).toBe(DEFAULT_ROW_LIMIT)
    expect(clampRowLimit(null)).toBe(DEFAULT_ROW_LIMIT)
  })

  it("clamps to the hard maximum", () => {
    expect(clampRowLimit(500)).toBe(MAX_ROW_LIMIT)
  })

  it("clamps to a minimum of 1 and truncates decimals", () => {
    expect(clampRowLimit(0)).toBe(1)
    expect(clampRowLimit(-5)).toBe(1)
    expect(clampRowLimit(12.9)).toBe(12)
  })

  it("passes through valid limits", () => {
    expect(clampRowLimit(30)).toBe(30)
  })
})

describe("manilaToday", () => {
  it("formats as YYYY-MM-DD in Asia/Manila", () => {
    // 2026-07-16 23:00 UTC is already 2026-07-17 in Manila (UTC+8)
    expect(manilaToday(new Date("2026-07-16T23:00:00Z"))).toBe("2026-07-17")
  })
})

describe("buildSystemPrompt", () => {
  const session = {
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

  it("contains today's date, the user, and the phone format rule", () => {
    const prompt = buildSystemPrompt(session)
    expect(prompt).toContain(manilaToday())
    expect(prompt).toContain("test-admin")
    expect(prompt).toContain("SuperAdmin")
    expect(prompt).toContain("+63 XXX XXX XXXX")
  })

  it("forbids deletes and retrying denied writes", () => {
    const prompt = buildSystemPrompt(session)
    expect(prompt).toContain("cannot delete")
    expect(prompt).toContain("do not retry")
  })
})
