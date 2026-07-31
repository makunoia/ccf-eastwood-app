/**
 * A DGroup leader whose own leader sits outside CCF Eastwood has no parent
 * DGroup to point at — they name the satellite instead. The two sides are
 * mutually exclusive, and the satellite must be a known Philippine one.
 */
import { describe, it, expect } from "vitest"
import { smallGroupSchema } from "@/lib/validations/small-group"
import {
  CCF_SATELLITES,
  EXTERNAL_SATELLITES,
  EXTERNAL_SATELLITES_BY_REGION,
  HOME_SATELLITE,
  isExternalSatellite,
  regionForSatellite,
} from "@/lib/constants/ccf-satellites"

const base = {
  name: "Tuesday Nights",
  leaderId: "leader-1",
  parentScope: "none" as const,
  parentGroupId: "",
  parentSatellite: "",
  groupType: "Regular",
  lifeStageIds: ["ls-1"],
  genderFocus: "Mixed",
  language: ["English"],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "InPerson",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "2",
  scheduleTimeStart: "19:00",
  scheduleTimeEnd: "21:00",
}

describe("CCF satellite list", () => {
  it("offers only Philippine satellites", () => {
    // The published list is PH-only; a stray overseas entry would be a data bug.
    const overseas = ["CCF Singapore", "CCF Dubai", "CCF Luxembourg", "CCF Tokyo"]
    for (const name of overseas) {
      expect(CCF_SATELLITES).not.toContain(name)
    }
  })

  it("covers all four Philippine regions", () => {
    expect(EXTERNAL_SATELLITES_BY_REGION.map((r) => r.region)).toEqual([
      "Metro Manila",
      "Luzon",
      "Visayas",
      "Mindanao",
    ])
  })

  it("excludes CCF Eastwood from the external options", () => {
    expect(CCF_SATELLITES).toContain(HOME_SATELLITE)
    expect(EXTERNAL_SATELLITES).not.toContain(HOME_SATELLITE)
    expect(isExternalSatellite(HOME_SATELLITE)).toBe(false)
  })

  it("has no duplicate satellite names", () => {
    expect(new Set(CCF_SATELLITES).size).toBe(CCF_SATELLITES.length)
  })

  it("maps a satellite back to its region", () => {
    expect(regionForSatellite("CCF Cebu")).toBe("Visayas")
    expect(regionForSatellite("CCF Davao")).toBe("Mindanao")
    expect(regionForSatellite("CCF Baguio")).toBe("Luzon")
    expect(regionForSatellite("CCF Nowhere")).toBeNull()
  })
})

describe("smallGroupSchema — parent satellite", () => {
  it("keeps the satellite and drops the parent group when scope is satellite", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "satellite",
      parentGroupId: "group-should-be-ignored",
      parentSatellite: "CCF Baguio",
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.parentSatellite).toBe("CCF Baguio")
    expect(parsed.data.parentGroupId).toBeNull()
  })

  it("keeps the parent group and drops the satellite when scope is group", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "group",
      parentGroupId: "group-1",
      parentSatellite: "CCF Baguio",
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.parentGroupId).toBe("group-1")
    expect(parsed.data.parentSatellite).toBeNull()
  })

  it("clears both sides when scope is none", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "none",
      parentGroupId: "group-1",
      parentSatellite: "CCF Baguio",
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.parentGroupId).toBeNull()
    expect(parsed.data.parentSatellite).toBeNull()
  })

  it("rejects the satellite scope with no satellite picked", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "satellite",
      parentSatellite: "",
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.message).toMatch(/which CCF satellite/i)
  })

  it("rejects a satellite that is not on the Philippine list", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "satellite",
      parentSatellite: "CCF Singapore",
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.message).toMatch(/unknown ccf satellite/i)
  })

  it("rejects CCF Eastwood as an external satellite", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "satellite",
      parentSatellite: HOME_SATELLITE,
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts every satellite on the external list", () => {
    for (const satellite of EXTERNAL_SATELLITES) {
      const parsed = smallGroupSchema.safeParse({
        ...base,
        parentScope: "satellite",
        parentSatellite: satellite,
      })
      expect(parsed.success, `${satellite} should be accepted`).toBe(true)
    }
  })

  it("infers the scope from the data when the selector is absent", () => {
    // Callers that predate the selector (CSV import, seeds) must keep working.
    const { parentScope: _omitted, ...withoutScope } = base

    const withGroup = smallGroupSchema.safeParse({
      ...withoutScope,
      parentGroupId: "group-1",
    })
    expect(withGroup.success).toBe(true)
    if (withGroup.success) expect(withGroup.data.parentGroupId).toBe("group-1")

    const withSatellite = smallGroupSchema.safeParse({
      ...withoutScope,
      parentSatellite: "CCF Cebu",
    })
    expect(withSatellite.success).toBe(true)
    if (withSatellite.success) {
      expect(withSatellite.data.parentSatellite).toBe("CCF Cebu")
      expect(withSatellite.data.parentGroupId).toBeNull()
    }

    const withNeither = smallGroupSchema.safeParse(withoutScope)
    expect(withNeither.success).toBe(true)
    if (withNeither.success) {
      expect(withNeither.data.parentGroupId).toBeNull()
      expect(withNeither.data.parentSatellite).toBeNull()
    }
  })

  it("treats an empty selector string as no scope", () => {
    const parsed = smallGroupSchema.safeParse({
      ...base,
      parentScope: "",
      parentGroupId: "group-1",
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.parentGroupId).toBe("group-1")
  })
})
