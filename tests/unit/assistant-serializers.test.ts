import { describe, expect, it } from "vitest"
import {
  dayLabel,
  formatSchedule,
  fullName,
  isoDate,
  toAssistantEventRow,
  toAssistantList,
  toAssistantMatchRow,
  toAssistantMemberRow,
} from "@/lib/assistant/serializers"

describe("primitive helpers", () => {
  it("isoDate converts Date to YYYY-MM-DD and passes null through", () => {
    expect(isoDate(new Date("2026-07-17T10:00:00Z"))).toBe("2026-07-17")
    expect(isoDate(null)).toBeNull()
  })

  it("dayLabel maps 0=Sunday…6=Saturday and rejects out-of-range", () => {
    expect(dayLabel(0)).toBe("Sunday")
    expect(dayLabel(6)).toBe("Saturday")
    expect(dayLabel(7)).toBeNull()
    expect(dayLabel(null)).toBeNull()
  })

  it("fullName includes nickname when present", () => {
    expect(fullName({ firstName: "Juan", lastName: "Dela Cruz" })).toBe("Juan Dela Cruz")
    expect(fullName({ firstName: "Juan", lastName: "Dela Cruz", nickname: "JD" })).toBe(
      'Juan "JD" Dela Cruz'
    )
  })

  it("formatSchedule combines day and time", () => {
    expect(formatSchedule(5, "19:00")).toBe("Friday 19:00")
    expect(formatSchedule(5, null)).toBe("Friday")
    expect(formatSchedule(null, "19:00")).toBeNull()
  })
})

describe("toAssistantList", () => {
  it("flags truncation when totalCount exceeds returned rows", () => {
    expect(toAssistantList([1, 2], 5)).toEqual({
      rows: [1, 2],
      totalCount: 5,
      truncated: true,
    })
    expect(toAssistantList([1, 2], 2).truncated).toBe(false)
  })
})

describe("toAssistantMemberRow", () => {
  it("flattens relations and converts dates", () => {
    const row = toAssistantMemberRow({
      id: "m1",
      firstName: "Maria",
      lastName: "Santos",
      nickname: null,
      email: "maria@example.com",
      phone: "+63 917 123 4567",
      gender: "Female",
      dateJoined: new Date("2025-01-15T00:00:00Z"),
      groupStatus: "Member",
      lifeStage: { name: "Young Pro" },
      smallGroup: { name: "Eastwood YP 1" },
    })
    expect(row).toEqual({
      id: "m1",
      name: "Maria Santos",
      email: "maria@example.com",
      phone: "+63 917 123 4567",
      lifeStage: "Young Pro",
      smallGroup: "Eastwood YP 1",
      groupStatus: "Member",
      gender: "Female",
      dateJoined: "2025-01-15",
    })
  })
})

describe("toAssistantEventRow", () => {
  it("converts price cents to pesos and keeps null for free events", () => {
    const base = {
      id: "e1",
      name: "Elevate Camp",
      type: "MultiDay",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-08-03T00:00:00Z"),
      _count: { registrants: 42 },
    }
    expect(toAssistantEventRow({ ...base, price: 150000 }).price).toBe(1500)
    expect(toAssistantEventRow({ ...base, price: null }).price).toBeNull()
  })
})

describe("toAssistantMatchRow", () => {
  it("rounds scores and defaults onCooldown, dropping extra fields", () => {
    const row = toAssistantMatchRow({
      groupId: "g1",
      groupName: "YP Friday",
      totalScore: 0.87654,
      breakdown: { lifeStage: 1, gender: 0.3333 },
      // candidateProfile intentionally absent from output
    })
    expect(row).toEqual({
      groupId: "g1",
      groupName: "YP Friday",
      totalScore: 0.88,
      onCooldown: false,
      breakdown: { lifeStage: 1, gender: 0.33 },
    })
  })
})
