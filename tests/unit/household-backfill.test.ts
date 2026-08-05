import { describe, expect, it } from "vitest"
import {
  householdBackfill,
  type HouseholdBackfillInput,
  type HouseholdBackfillTarget,
} from "@/lib/households/backfill"
import {
  REGISTRANT_FIELD_GATES,
  sanitizeHouseholdMember,
} from "@/lib/forms/registration-payload"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"

/**
 * The fill-if-empty rule for a matched household member, in isolation. The
 * DB-backed half — that both household write paths actually call this, and that
 * they agree — lives in tests/integration/household-member-backfill.
 */

const EMPTY: HouseholdBackfillTarget = {
  nickname: null,
  gender: null,
  birthMonth: null,
  birthYear: null,
  ageRangeBucketId: null,
}

const ANSWERS: HouseholdBackfillInput = {
  nickname: "Anne",
  gender: "Female",
  birthMonth: 3,
  birthYear: 2014,
  ageRangeBucketId: "bucket-1",
}

describe("householdBackfill", () => {
  it("fills every empty field from the answers", () => {
    expect(householdBackfill(EMPTY, ANSWERS)).toEqual({
      nickname: "Anne",
      gender: "Female",
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: "bucket-1",
    })
  })

  it("writes nothing when the profile already holds everything", () => {
    const stored: HouseholdBackfillTarget = {
      nickname: "Annie",
      gender: "Male",
      birthMonth: 7,
      birthYear: 2010,
      ageRangeBucketId: "bucket-9",
    }
    expect(householdBackfill(stored, ANSWERS)).toEqual({})
  })

  it("fills only the gaps, leaving known values alone", () => {
    const stored: HouseholdBackfillTarget = { ...EMPTY, nickname: "Annie" }
    expect(householdBackfill(stored, ANSWERS)).toEqual({
      gender: "Female",
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: "bucket-1",
    })
  })

  it("writes nothing when there are no answers to write", () => {
    expect(householdBackfill(EMPTY, {})).toEqual({})
  })

  it("treats an unknown guest (no match row) as entirely empty", () => {
    expect(householdBackfill(null, ANSWERS)).toMatchObject({ nickname: "Anne" })
  })

  it("edge case — birth month rides with the year rather than moving alone", () => {
    // One answer on the form, so a stored year keeps its month; and a year given
    // without a month clears the month rather than leaving a mismatched pair.
    const withYear: HouseholdBackfillTarget = { ...EMPTY, birthYear: 2010 }
    expect(householdBackfill(withYear, ANSWERS).birthMonth).toBeUndefined()
    expect(householdBackfill(withYear, ANSWERS).birthYear).toBeUndefined()

    expect(householdBackfill(EMPTY, { birthYear: 2014 })).toEqual({
      birthYear: 2014,
      birthMonth: null,
    })
  })

  it("edge case — an empty-string nickname counts as no answer", () => {
    expect(householdBackfill(EMPTY, { nickname: "" })).toEqual({})
  })

  it("covers exactly the household member fields the sanitizer gates", () => {
    // A field the household form can collect but this never backfills is a
    // silent data-loss bug at the second registration — the shape of the bug
    // this helper exists to fix. Fails loudly when the gated set grows.
    const gated = Object.keys(
      sanitizeHouseholdMember(BARE_EVENT_FORM_CONFIG, {
        nickname: null,
        birthMonth: null,
        birthYear: null,
        gender: null,
        ageRangeBucketId: null,
      })
    ).sort()
    const backfilled = Object.keys(householdBackfill(EMPTY, ANSWERS)).sort()

    expect(backfilled).toEqual(gated)
    // And every one of them is genuinely a gated field, not an invention.
    expect(gated.every((f) => f in REGISTRANT_FIELD_GATES)).toBe(true)
  })
})
