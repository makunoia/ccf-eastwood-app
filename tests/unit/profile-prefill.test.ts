/**
 * CCF-147 — turning a stored profile into a reviewable, submittable registration.
 *
 * The load-bearing assertion here is `fieldsStillNeeded`: a field marked Required
 * that the profile can't satisfy must still be asked on the fast path. The skip
 * keys off profile nulls, never off "we already showed them a screen".
 */
import { describe, it, expect } from "vitest"
import { BARE_EVENT_FORM_CONFIG, type EventFormConfigData } from "@/lib/forms/context-config"
import {
  fieldsStillNeeded,
  mergedAnswersFor,
  prefillFromProfile,
  profileSummaryRows,
  type RegistrationProfileSnapshot,
} from "@/lib/forms/profile-prefill"

const FULL: RegistrationProfileSnapshot = {
  recordId: "m1",
  recordType: "member",
  firstName: "Maria",
  lastName: "Santos",
  nickname: "Mari",
  email: "maria@example.com",
  emailMasked: "m•••@example.com",
  phone: "+63 917 123 4567",
  birthMonth: 4,
  birthYear: 1992,
  ageRangeBucketId: "ar1",
  lifeStageId: "ls1",
  gender: "Female",
  language: ["English", "Tagalog"],
  meetingPreference: "InPerson",
  workCity: "Makati",
  scheduleDayOfWeek: 2,
  scheduleTimeStart: "19:00",
  scheduleTimeEnd: "21:00",
  smallGroupId: null,
  claimedSmallGroupId: null,
  claimedSatellite: null,
  isVolunteer: false,
}

const EMPTY: RegistrationProfileSnapshot = {
  ...FULL,
  recordId: "g1",
  recordType: "guest",
  nickname: null,
  email: null,
  emailMasked: null,
  birthMonth: null,
  birthYear: null,
  ageRangeBucketId: null,
  lifeStageId: null,
  gender: null,
  language: [],
  meetingPreference: null,
  workCity: null,
  scheduleDayOfWeek: null,
  scheduleTimeStart: null,
  scheduleTimeEnd: null,
}

const configWith = (overrides: Partial<EventFormConfigData>): EventFormConfigData => ({
  ...BARE_EVENT_FORM_CONFIG,
  ...overrides,
})

describe("prefillFromProfile", () => {
  it("flattens every value to the string shape the form holds", () => {
    const prefill = prefillFromProfile(FULL)
    expect(prefill.birthMonth).toBe("4")
    expect(prefill.birthYear).toBe("1992")
    expect(prefill.scheduleDayOfWeek).toBe("2")
    expect(prefill.mobileNumber).toBe("+63 917 123 4567")
    expect(prefill.language).toEqual(["English", "Tagalog"])
  })

  it("renders a null as an empty string, never the text 'null'", () => {
    const prefill = prefillFromProfile(EMPTY)
    expect(prefill.email).toBe("")
    expect(prefill.birthYear).toBe("")
    expect(prefill.workCity).toBe("")
    expect(prefill.language).toEqual([])
  })

  it("keeps Sunday (0) as an answer rather than blanking it", () => {
    const prefill = prefillFromProfile({ ...FULL, scheduleDayOfWeek: 0 })
    expect(prefill.scheduleDayOfWeek).toBe("0")
  })

  it("gives the edit form the real email, not the masked one", () => {
    expect(prefillFromProfile(FULL).email).toBe("maria@example.com")
  })
})

describe("mergedAnswersFor", () => {
  it("fills a blank answer from the profile", () => {
    const merged = mergedAnswersFor(FULL, { workCity: "" })
    expect(merged.workCity).toBe("Makati")
  })

  it("lets a typed answer win over the profile", () => {
    const merged = mergedAnswersFor(FULL, { workCity: "Ortigas" })
    expect(merged.workCity).toBe("Ortigas")
  })

  it("passes the typed answers straight through with no profile", () => {
    expect(mergedAnswersFor(null, { workCity: "Ortigas" })).toEqual({ workCity: "Ortigas" })
  })
})

describe("fieldsStillNeeded", () => {
  it("asks for a required field the profile has nothing for", () => {
    const config = configWith({ fieldWorkCity: true, fieldWorkCityRequired: true })
    const merged = mergedAnswersFor(EMPTY, { wantsSmallGroup: true })
    expect(fieldsStillNeeded(config, "Register", merged)).toContain("fieldWorkCity")
  })

  it("does not ask for a required field the profile already satisfies", () => {
    const config = configWith({ fieldWorkCity: true, fieldWorkCityRequired: true })
    const merged = mergedAnswersFor(FULL, { wantsSmallGroup: true })
    expect(fieldsStillNeeded(config, "Register", merged)).not.toContain("fieldWorkCity")
  })

  it("ignores a required flag on a field the form has switched off", () => {
    const config = configWith({ fieldWorkCity: false, fieldWorkCityRequired: true })
    const merged = mergedAnswersFor(EMPTY, { wantsSmallGroup: true })
    expect(fieldsStillNeeded(config, "Register", merged)).not.toContain("fieldWorkCity")
  })

  it("does not ask a DGroup-step field of someone who isn't looking for a group", () => {
    const config = configWith({
      sectionSmallGroup: true,
      fieldWorkCity: true,
      fieldWorkCityRequired: true,
    })
    const merged = mergedAnswersFor(EMPTY, { wantsSmallGroup: false })
    expect(fieldsStillNeeded(config, "Register", merged)).not.toContain("fieldWorkCity")
  })

  it("degrades to the full set of questions for an all-null profile", () => {
    const config = configWith({
      fieldLifeStage: true, fieldLifeStageRequired: true,
      fieldGender: true, fieldGenderRequired: true,
      fieldBirthDate: true, fieldBirthDateRequired: true,
    })
    const merged = mergedAnswersFor(EMPTY, {})
    expect(fieldsStillNeeded(config, "Register", merged).sort()).toEqual(
      ["fieldBirthDate", "fieldGender", "fieldLifeStage"].sort()
    )
  })

  it("treats a stored Sunday as answered — 0 is not 'blank'", () => {
    const config = configWith({ fieldSchedule: true, fieldScheduleRequired: true })
    const merged = mergedAnswersFor(
      { ...EMPTY, scheduleDayOfWeek: 0 },
      { wantsSmallGroup: true }
    )
    expect(fieldsStillNeeded(config, "Register", merged)).not.toContain("fieldSchedule")
  })
})

describe("profileSummaryRows", () => {
  const config = configWith({
    fieldNickname: true,
    fieldLifeStage: true,
    fieldGender: true,
    fieldBirthDate: true,
    fieldWorkCity: true,
    fieldLanguage: true,
    fieldMeetingPreference: true,
    fieldSchedule: true,
  })
  const lookups = {
    lifeStages: [{ id: "ls1", name: "Young Pro" }],
    ageRanges: [{ id: "ar1", label: "31–40" }],
  }

  it("always leads with the name", () => {
    expect(profileSummaryRows(FULL, config, lookups)[0]).toEqual({
      key: "name",
      label: "Name",
      value: "Maria Santos",
    })
  })

  it("shows the email masked and the mobile in full", () => {
    const rows = profileSummaryRows(FULL, config, lookups)
    expect(rows.find((r) => r.key === "email")?.value).toBe("m•••@example.com")
    // The person typed this number to get here, so masking it back would be theatre.
    expect(rows.find((r) => r.key === "mobile")?.value).toBe("+63 917 123 4567")
  })

  it("resolves id-shaped fields to their display names", () => {
    const rows = profileSummaryRows(FULL, config, lookups)
    expect(rows.find((r) => r.key === "lifeStage")?.value).toBe("Young Pro")
  })

  it("omits a field this form has switched off", () => {
    const rows = profileSummaryRows(FULL, configWith({ fieldWorkCity: false }), lookups)
    expect(rows.some((r) => r.key === "workCity")).toBe(false)
  })

  it("omits an empty value rather than rendering a wall of dashes", () => {
    const rows = profileSummaryRows(EMPTY, config, lookups)
    expect(rows.map((r) => r.key)).toEqual(["name", "mobile"])
  })

  it("formats the composite fields through the shared formatters", () => {
    const rows = profileSummaryRows(FULL, config, lookups)
    expect(rows.find((r) => r.key === "birthDate")?.value).toBe("April 1992")
    expect(rows.find((r) => r.key === "language")?.value).toBe("English, Tagalog")
    expect(rows.find((r) => r.key === "meetingPreference")?.value).toBe("In Person")
    expect(rows.find((r) => r.key === "schedule")?.value).toBe("Tuesday, 19:00 – 21:00")
  })
})
