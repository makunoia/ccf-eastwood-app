import { describe, expect, it } from "vitest"

import { filterVolunteerAssignmentPool } from "@/lib/volunteers/assignment-profile"
import { ageGroupForBirthDate } from "@/lib/volunteers/age-groups"

const volunteers = [
  { id: "young", ageGroup: "25–34", lifeStageId: "young-adults" },
  { id: "family", ageGroup: "35–49", lifeStageId: "families" },
  { id: "unprofiled", ageGroup: null, lifeStageId: null },
]

describe("filterVolunteerAssignmentPool", () => {
  it("retains the full pool when no profile filter is selected", () => {
    expect(filterVolunteerAssignmentPool(volunteers, { ageGroup: "", lifeStageId: "" }))
      .toEqual(volunteers)
  })

  it("requires selected age group and life stage to both match", () => {
    expect(filterVolunteerAssignmentPool(volunteers, { ageGroup: "25–34", lifeStageId: "young-adults" }))
      .toEqual([volunteers[0]])
    expect(filterVolunteerAssignmentPool(volunteers, { ageGroup: "35–49", lifeStageId: "young-adults" }))
      .toEqual([])
  })
})

describe("ageGroupForBirthDate", () => {
  it("does not advance an age band before the birthday month", () => {
    expect(ageGroupForBirthDate(2001, 10, new Date("2026-09-11T00:00:00Z"))).toBe("18–24")
    expect(ageGroupForBirthDate(2001, 9, new Date("2026-09-11T00:00:00Z"))).toBe("25–34")
  })
})
