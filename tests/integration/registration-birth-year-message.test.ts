/**
 * A registrant who mistypes their birth year used to get Zod's default
 * "Too small: expected number to be >=1900" toasted at them on the public
 * registration form. These pin the readable replacement at the two entry points
 * that surface it — and the household one at the member it came from.
 *
 * Both actions parse before touching the database, so no seeding is needed:
 * the point is precisely that a bad payload never gets that far.
 */
import { describe, it, expect, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant, createHouseholdRegistration } from "@/app/(dashboard)/events/actions"
import { birthYearMessage } from "@/lib/validations/birth-date"

afterAll(async () => {
  await db.$disconnect()
})

const person = { firstName: "Ana", lastName: "Cruz", mobileNumber: "09171234567" }

describe("createRegistrant — birth year", () => {
  it("returns a readable message for a year outside the plausible window", async () => {
    const result = await createRegistrant("evt-does-not-matter", { ...person, birthYear: 1850 }, null)

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toBe(birthYearMessage())
  })

  it("returns the same message for a half-typed year", async () => {
    const result = await createRegistrant("evt-does-not-matter", { ...person, birthYear: 19 }, null)

    expect(result.success === false && result.error).toBe(birthYearMessage())
  })

  it("never leaks Zod's default wording", async () => {
    const result = await createRegistrant("evt-does-not-matter", { ...person, birthYear: 3000 }, null)

    expect(result.success === false && result.error).not.toMatch(/too small|too big|expected number/i)
  })
})

describe("createHouseholdRegistration — birth year", () => {
  it("names the household member the bad year belongs to", async () => {
    const result = await createHouseholdRegistration(
      "evt-does-not-matter",
      person,
      {
        primaryRole: "FatherHusband",
        members: [
          { firstName: "Miguel", lastName: "Cruz", role: "Child", birthYear: 2015 },
          { firstName: "Sofia", lastName: "Cruz", role: "Child", birthYear: 1850 },
        ],
      },
      null
    )

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toBe(`Sofia Cruz: ${birthYearMessage()}`)
  })

  it("leaves the message unprefixed when the member has no name to prefix with", async () => {
    const result = await createHouseholdRegistration(
      "evt-does-not-matter",
      person,
      { primaryRole: "FatherHusband", members: [{ firstName: "", lastName: "", role: "Child" }] },
      null
    )

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toBe("First name is required")
  })
})
