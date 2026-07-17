import { describe, expect, it } from "vitest"
import { personTitle, registrantName } from "@/lib/metadata"

describe("personTitle", () => {
  it("builds a '{name} · {section}' title", () => {
    expect(personTitle({ firstName: "Juan", lastName: "Dela Cruz" }, "Members")).toBe(
      "Juan Dela Cruz · Members"
    )
  })

  it("falls back to the bare section when the record is missing", () => {
    expect(personTitle(null, "Members")).toBe("Members")
    expect(personTitle(undefined, "Guests")).toBe("Guests")
  })
})

describe("registrantName", () => {
  const base = { firstName: null, lastName: null, member: null, guest: null }

  it("prefers the linked member over everything else", () => {
    expect(
      registrantName(
        {
          ...base,
          firstName: "Stale",
          lastName: "Copy",
          member: { firstName: "Juan", lastName: "Dela Cruz" },
          guest: { firstName: "Guest", lastName: "Record" },
        },
        "Registrant"
      )
    ).toBe("Juan Dela Cruz")
  })

  it("uses the linked guest when there is no member", () => {
    expect(
      registrantName({ ...base, guest: { firstName: "Maria", lastName: "Santos" } }, "Registrant")
    ).toBe("Maria Santos")
  })

  it("uses personal fields for walk-ins linked to neither", () => {
    expect(registrantName({ ...base, firstName: "Ana", lastName: "Reyes" }, "Registrant")).toBe(
      "Ana Reyes"
    )
  })

  it("tolerates a half-populated walk-in name", () => {
    expect(registrantName({ ...base, firstName: "Ana", lastName: null }, "Registrant")).toBe("Ana")
  })

  it("falls back when the registrant is missing or has no usable name", () => {
    expect(registrantName(null, "Registrant")).toBe("Registrant")
    expect(registrantName({ ...base }, "Registrant")).toBe("Registrant")
    expect(registrantName({ ...base, firstName: "  ", lastName: null }, "Registrant")).toBe(
      "Registrant"
    )
  })
})
