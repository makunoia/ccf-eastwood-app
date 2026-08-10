import { describe, it, expect } from "vitest"
import {
  buildPromotedMemberData,
  type PromotableGuest,
} from "@/lib/people/promote-guest"

/**
 * The pure half of guest→member promotion: which Guest columns land on the new
 * Member, and how a guest's single availability slot becomes a SchedulePreference.
 *
 * The four promotion sites share this function, so a change here moves all of
 * them — which is the point, and why the schedule and email policies are pinned
 * per option rather than left to whichever caller happens to run in a test.
 */

const JOINED = new Date("2026-03-15T00:00:00.000Z")

function guest(overrides: Partial<PromotableGuest> = {}): PromotableGuest {
  return {
    memberId: null,
    firstName: "Ella",
    lastName: "Santos",
    nickname: "Ellie",
    email: "ella@example.com",
    phone: "+63 917 222 3333",
    notes: "Met at the retreat",
    lifeStageId: "life-stage-1",
    ageRangeBucketId: "bucket-1",
    gender: "Female",
    language: ["en", "tl"],
    birthMonth: 4,
    birthYear: 1994,
    workCity: "Quezon City",
    workIndustry: "Healthcare",
    meetingPreference: "Hybrid",
    scheduleDayOfWeek: 2,
    scheduleTimeStart: "19:00",
    scheduleTimeEnd: "21:00",
    ...overrides,
  }
}

describe("buildPromotedMemberData — field copy", () => {
  it("carries every matching field onto the new member", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED })

    expect(data).toMatchObject({
      firstName: "Ella",
      lastName: "Santos",
      nickname: "Ellie",
      email: "ella@example.com",
      phone: "+63 917 222 3333",
      notes: "Met at the retreat",
      lifeStageId: "life-stage-1",
      ageRangeBucketId: "bucket-1",
      gender: "Female",
      language: ["en", "tl"],
      birthMonth: 4,
      birthYear: 1994,
      workCity: "Quezon City",
      workIndustry: "Healthcare",
      meetingPreference: "Hybrid",
    })
  })

  it("uses the supplied dateJoined rather than today", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED })
    expect(data.dateJoined).toBe(JOINED)
  })
})

describe("buildPromotedMemberData — group placement", () => {
  it("leaves both group columns null when no group is given", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED })
    expect(data.smallGroupId).toBeNull()
    // A member with no DGroup has no group status — not a defaulted "Member".
    expect(data.groupStatus).toBeNull()
  })

  it("treats an explicit null group the same as omitting it", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED, groupId: null })
    expect(data.smallGroupId).toBeNull()
    expect(data.groupStatus).toBeNull()
  })

  it("sets groupStatus Member when a group is given", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED, groupId: "grp-1" })
    expect(data.smallGroupId).toBe("grp-1")
    expect(data.groupStatus).toBe("Member")
  })
})

describe("buildPromotedMemberData — email override", () => {
  it("uses the guest's email by default", () => {
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED })
    expect(data.email).toBe("ella@example.com")
  })

  it("drops just the email when the caller overrides it with null", () => {
    // The batched Catch Mech path does this when the address already belongs to
    // another Member — Member.email is unique, Guest.email is not.
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED, email: null })
    expect(data.email).toBeNull()
    expect(data.firstName).toBe("Ella")
    expect(data.phone).toBe("+63 917 222 3333")
  })
})

describe("buildPromotedMemberData — schedule policies", () => {
  it("raw: passes the guest's times through untouched", () => {
    const { schedule } = buildPromotedMemberData(guest(), { dateJoined: JOINED })
    expect(schedule).toEqual({ dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" })
  })

  it("raw: keeps a missing end time null instead of inventing one", () => {
    const { schedule } = buildPromotedMemberData(guest({ scheduleTimeEnd: null }), {
      dateJoined: JOINED,
      schedule: "raw",
    })
    expect(schedule).toEqual({ dayOfWeek: 2, timeStart: "19:00", timeEnd: null })
  })

  it("raw: yields no slot when the guest gave a day but no start time", () => {
    const { schedule } = buildPromotedMemberData(
      guest({ scheduleTimeStart: null, scheduleTimeEnd: null }),
      { dateJoined: JOINED, schedule: "raw" }
    )
    expect(schedule).toBeNull()
  })

  it("normalized: widens a day-only availability into a whole day", () => {
    const { schedule } = buildPromotedMemberData(
      guest({ scheduleTimeStart: null, scheduleTimeEnd: null }),
      { dateJoined: JOINED, schedule: "normalized" }
    )
    expect(schedule).toEqual({ dayOfWeek: 2, timeStart: "00:00", timeEnd: "23:59" })
  })

  it("normalized: gives a start-only availability a one-hour slot", () => {
    const { schedule } = buildPromotedMemberData(guest({ scheduleTimeEnd: null }), {
      dateJoined: JOINED,
      schedule: "normalized",
    })
    expect(schedule).toEqual({ dayOfWeek: 2, timeStart: "19:00", timeEnd: "20:00" })
  })

  it("yields no slot under either policy when the guest gave no day", () => {
    const noDay = guest({ scheduleDayOfWeek: null })
    expect(buildPromotedMemberData(noDay, { dateJoined: JOINED, schedule: "raw" }).schedule).toBeNull()
    expect(
      buildPromotedMemberData(noDay, { dateJoined: JOINED, schedule: "normalized" }).schedule
    ).toBeNull()
  })

  it("never nests the schedule into the member payload", () => {
    // The batched caller pushes it onto a createMany instead; a nested write here
    // would silently restore the per-guest round trip it removed.
    const { data } = buildPromotedMemberData(guest(), { dateJoined: JOINED })
    expect(data).not.toHaveProperty("schedulePreferences")
  })
})
