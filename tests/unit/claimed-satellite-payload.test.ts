/**
 * "I'm already part of a DGroup" has two possible answers: one of our groups,
 * or a group at another CCF satellite. These pin the payload contract — the two
 * are mutually exclusive, the satellite must be a real Philippine one, and the
 * field is gated by the same DGroup section toggle as its sibling.
 */
import { describe, it, expect } from "vitest"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  REGISTRANT_FIELD_GATES,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"
import { HOME_SATELLITE } from "@/lib/constants/ccf-satellites"

const base = { firstName: "Maria", lastName: "Santos" }

describe("registrantSchema — claimedSatellite", () => {
  it("accepts a Philippine satellite", () => {
    const parsed = registrantSchema.parse({ ...base, claimedSatellite: "CCF Cebu" })
    expect(parsed.claimedSatellite).toBe("CCF Cebu")
  })

  it("defaults to null when the question isn't answered", () => {
    expect(registrantSchema.parse(base).claimedSatellite).toBeNull()
  })

  it("normalises an empty string to null", () => {
    expect(registrantSchema.parse({ ...base, claimedSatellite: "" }).claimedSatellite).toBeNull()
  })

  it("drops a stale group id when a satellite is named", () => {
    // The person picked one of our groups, then switched to "another satellite".
    const parsed = registrantSchema.parse({
      ...base,
      claimedSmallGroupId: "grp_1",
      claimedSatellite: "CCF Davao",
    })
    expect(parsed.claimedSatellite).toBe("CCF Davao")
    expect(parsed.claimedSmallGroupId).toBeNull()
  })

  it("leaves a claimed group alone when no satellite is named", () => {
    const parsed = registrantSchema.parse({ ...base, claimedSmallGroupId: "grp_1" })
    expect(parsed.claimedSmallGroupId).toBe("grp_1")
    expect(parsed.claimedSatellite).toBeNull()
  })

  it("rejects a satellite outside the Philippines", () => {
    const parsed = registrantSchema.safeParse({ ...base, claimedSatellite: "CCF Singapore" })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.message).toMatch(/unknown ccf satellite/i)
  })

  it("rejects CCF Eastwood — that answer is a local group, not a satellite", () => {
    expect(
      registrantSchema.safeParse({ ...base, claimedSatellite: HOME_SATELLITE }).success
    ).toBe(false)
  })

  it("rejects free text", () => {
    expect(
      registrantSchema.safeParse({ ...base, claimedSatellite: "somewhere else" }).success
    ).toBe(false)
  })
})

describe("payload gating — claimedSatellite", () => {
  it("is gated by the DGroup section, same as claimedSmallGroupId", () => {
    expect(REGISTRANT_FIELD_GATES.claimedSatellite).toBe("sectionSmallGroup")
    expect(REGISTRANT_FIELD_GATES.claimedSatellite).toBe(
      REGISTRANT_FIELD_GATES.claimedSmallGroupId
    )
  })

  it("is neutralised when the DGroup section is off", () => {
    const out = sanitizeRegistrantPayload(BARE_EVENT_FORM_CONFIG, {
      ...base,
      claimedSatellite: "CCF Cebu",
    })
    expect(out.claimedSatellite).toBeNull()
  })

  it("survives when the DGroup section is on", () => {
    const out = sanitizeRegistrantPayload(
      { ...BARE_EVENT_FORM_CONFIG, sectionSmallGroup: true },
      { ...base, claimedSatellite: "CCF Cebu" }
    )
    expect(out.claimedSatellite).toBe("CCF Cebu")
  })
})
