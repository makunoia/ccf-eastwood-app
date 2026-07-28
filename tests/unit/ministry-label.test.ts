import { describe, expect, it } from "vitest"
import { ministryLabel } from "@/lib/events/ministry-label"

describe("ministryLabel", () => {
  it("says nothing for a ministry-agnostic event", () => {
    expect(ministryLabel(false, [])).toBe("")
  })

  it("names a single ministry", () => {
    expect(ministryLabel(false, ["Young Pro"])).toBe("Young Pro")
  })

  it("joins several ministries", () => {
    expect(ministryLabel(false, ["Young Pro", "Couples"])).toBe("Young Pro · Couples")
  })

  it("says All Ministries for a church-wide event", () => {
    expect(ministryLabel(true, [])).toBe("All Ministries")
  })

  it("prefers the flag over any stale names", () => {
    expect(ministryLabel(true, ["Young Pro"])).toBe("All Ministries")
  })
})
