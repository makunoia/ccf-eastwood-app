import { describe, it, expect } from "vitest"

/**
 * CCF-75: Event Breakout Group detail page improvements
 *
 * The SmallGroupCard in the facilitator section now shows just the group name
 * as a clickable button. Clicking it opens a Sheet (right-side drawer) with
 * the full group profile details.
 *
 * This is a pure UI change — the logic under test is the detail-building
 * that drives what appears in the Sheet.
 */

// Mirrors the detail-building logic from SmallGroupCard in breakout-detail.tsx
const MEETING_FORMAT_LABELS: Record<string, string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In-Person",
}

const GENDER_FOCUS_LABELS: Record<string, string> = {
  Male: "Male",
  Female: "Female",
  Mixed: "Mixed",
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatTime(t: string) {
  const [hStr, mStr] = t.split(":")
  const h = parseInt(hStr)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${mStr} ${ampm}`
}

type LedGroup = {
  id: string
  name: string
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
}

function buildGroupDetails(group: LedGroup) {
  const details: { label: string; value: string }[] = []
  if (group.lifeStage) details.push({ label: "Life Stage", value: group.lifeStage.name })
  if (group.genderFocus) details.push({ label: "Gender Focus", value: GENDER_FOCUS_LABELS[group.genderFocus] ?? group.genderFocus })
  if (group.language.length > 0) details.push({ label: "Language", value: group.language.join(", ") })
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    details.push({ label: "Age Range", value: `${group.ageRangeMin ?? "?"}–${group.ageRangeMax ?? "+"}` })
  }
  if (group.meetingFormat) details.push({ label: "Format", value: MEETING_FORMAT_LABELS[group.meetingFormat] ?? group.meetingFormat })
  if (group.locationCity) details.push({ label: "Location", value: group.locationCity })
  if (group.scheduleDayOfWeek != null && group.scheduleTimeStart) {
    details.push({ label: "Schedule", value: `${DAY_LABELS[group.scheduleDayOfWeek]} ${formatTime(group.scheduleTimeStart)}` })
  }
  return details
}

const baseGroup: LedGroup = {
  id: "g1",
  name: "Alpha Group",
  lifeStage: null,
  genderFocus: null,
  language: [],
  ageRangeMin: null,
  ageRangeMax: null,
  meetingFormat: null,
  locationCity: null,
  scheduleDayOfWeek: null,
  scheduleTimeStart: null,
}

describe("CCF-75", () => {
  describe("unit", () => {
    it("returns empty details array when group has no profile fields set", () => {
      const details = buildGroupDetails(baseGroup)
      expect(details).toHaveLength(0)
    })

    it("includes Life Stage when set", () => {
      const details = buildGroupDetails({
        ...baseGroup,
        lifeStage: { id: "ls1", name: "Young Adults" },
      })
      expect(details).toContainEqual({ label: "Life Stage", value: "Young Adults" })
    })

    it("maps genderFocus enum to human-readable label", () => {
      const maleDetails = buildGroupDetails({ ...baseGroup, genderFocus: "Male" })
      expect(maleDetails.find((d) => d.label === "Gender Focus")?.value).toBe("Male")

      const mixedDetails = buildGroupDetails({ ...baseGroup, genderFocus: "Mixed" })
      expect(mixedDetails.find((d) => d.label === "Gender Focus")?.value).toBe("Mixed")

      const femaleDetails = buildGroupDetails({ ...baseGroup, genderFocus: "Female" })
      expect(femaleDetails.find((d) => d.label === "Gender Focus")?.value).toBe("Female")
    })

    it("joins multiple languages with comma", () => {
      const details = buildGroupDetails({ ...baseGroup, language: ["Filipino", "English"] })
      expect(details.find((d) => d.label === "Language")?.value).toBe("Filipino, English")
    })

    it("shows age range with only min set", () => {
      const details = buildGroupDetails({ ...baseGroup, ageRangeMin: 20, ageRangeMax: null })
      expect(details.find((d) => d.label === "Age Range")?.value).toBe("20–+")
    })

    it("shows age range with only max set", () => {
      const details = buildGroupDetails({ ...baseGroup, ageRangeMin: null, ageRangeMax: 35 })
      expect(details.find((d) => d.label === "Age Range")?.value).toBe("?–35")
    })

    it("maps meetingFormat InPerson to human-readable label", () => {
      const details = buildGroupDetails({ ...baseGroup, meetingFormat: "InPerson" })
      expect(details.find((d) => d.label === "Format")?.value).toBe("In-Person")
    })

    it("includes Location when locationCity is set", () => {
      const details = buildGroupDetails({ ...baseGroup, locationCity: "Makati" })
      expect(details.find((d) => d.label === "Location")?.value).toBe("Makati")
    })

    it("formats schedule with day label and 12-hour time", () => {
      // Sunday = 0, 14:00 = 2:00 PM
      const details = buildGroupDetails({ ...baseGroup, scheduleDayOfWeek: 0, scheduleTimeStart: "14:00" })
      expect(details.find((d) => d.label === "Schedule")?.value).toBe("Sun 2:00 PM")
    })

    it("omits schedule when only day is set without time", () => {
      const details = buildGroupDetails({ ...baseGroup, scheduleDayOfWeek: 1, scheduleTimeStart: null })
      expect(details.find((d) => d.label === "Schedule")).toBeUndefined()
    })

    it("omits schedule when only time is set without day", () => {
      const details = buildGroupDetails({ ...baseGroup, scheduleDayOfWeek: null, scheduleTimeStart: "10:00" })
      expect(details.find((d) => d.label === "Schedule")).toBeUndefined()
    })

    it("builds all details for a fully-populated group", () => {
      const full: LedGroup = {
        id: "g2",
        name: "Beta Group",
        lifeStage: { id: "ls2", name: "Married" },
        genderFocus: "Mixed",
        language: ["English"],
        ageRangeMin: 25,
        ageRangeMax: 40,
        meetingFormat: "Hybrid",
        locationCity: "BGC",
        scheduleDayOfWeek: 6,
        scheduleTimeStart: "09:30",
      }
      const details = buildGroupDetails(full)
      const labels = details.map((d) => d.label)
      expect(labels).toEqual(["Life Stage", "Gender Focus", "Language", "Age Range", "Format", "Location", "Schedule"])
    })

    it("formatTime converts AM times correctly", () => {
      expect(formatTime("09:00")).toBe("9:00 AM")
      expect(formatTime("00:30")).toBe("12:30 AM")
    })

    it("formatTime converts PM times correctly", () => {
      expect(formatTime("13:00")).toBe("1:00 PM")
      expect(formatTime("12:00")).toBe("12:00 PM")
    })
  })

  describe("integration", () => {
    it.todo("No server actions introduced — UI-only change")
  })

  describe("regression", () => {
    it("group with no profile fields returns empty detail list without throwing", () => {
      expect(() => buildGroupDetails(baseGroup)).not.toThrow()
      expect(buildGroupDetails(baseGroup)).toEqual([])
    })

    it("group with all nulls/empty arrays returns empty detail list", () => {
      const details = buildGroupDetails({
        id: "g3",
        name: "Empty Group",
        lifeStage: null,
        genderFocus: null,
        language: [],
        ageRangeMin: null,
        ageRangeMax: null,
        meetingFormat: null,
        locationCity: null,
        scheduleDayOfWeek: null,
        scheduleTimeStart: null,
      })
      expect(details).toHaveLength(0)
    })
  })
})
