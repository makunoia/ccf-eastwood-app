import { describe, it, expect } from "vitest"
import { computeGuestStatus } from "@/lib/guest-utils"

const NO_REGISTRATIONS = { eventRegistrations: [] }

describe("computeGuestStatus", () => {
  it("returns Member when memberId is set, regardless of other fields", () => {
    expect(
      computeGuestStatus({
        memberId: "member-1",
        hasPendingSmallGroupRequest: true,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [
          {
            attendedAt: new Date(),
            occurrenceAttendances: [{ id: "oa-1" }],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
    ).toBe("Member")
  })

  it("returns Pending when there is a pending small group request and no memberId", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: true,
        hasRejectedSmallGroupRequest: false,
        ...NO_REGISTRATIONS,
      })
    ).toBe("Pending")
  })

  it("returns Matched when in a breakout group with no rejected request", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
    ).toBe("Matched")
  })

  it("returns Declined when in a breakout group with a rejected request", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
    ).toBe("Declined")
  })

  it("returns Declined when not in a breakout group but has a rejected request", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: true,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [],
          },
        ],
      })
    ).toBe("Declined")
  })

  it("returns EventAttendee when attendedAt is set", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: new Date(),
            occurrenceAttendances: [],
            breakoutGroupMemberships: [],
          },
        ],
      })
    ).toBe("EventAttendee")
  })

  it("returns EventAttendee when occurrence attendances exist", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [{ id: "oa-1" }],
            breakoutGroupMemberships: [],
          },
        ],
      })
    ).toBe("EventAttendee")
  })

  it("returns New when guest has no registrations, no requests, no memberId", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        ...NO_REGISTRATIONS,
      })
    ).toBe("New")
  })

  it("returns New when guest registered but never attended and has no breakout/request", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: false,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: null,
            occurrenceAttendances: [],
            breakoutGroupMemberships: [],
          },
        ],
      })
    ).toBe("New")
  })

  it("Pending takes priority over Matched/EventAttendee", () => {
    expect(
      computeGuestStatus({
        memberId: null,
        hasPendingSmallGroupRequest: true,
        hasRejectedSmallGroupRequest: false,
        eventRegistrations: [
          {
            attendedAt: new Date(),
            occurrenceAttendances: [{ id: "oa-1" }],
            breakoutGroupMemberships: [{ breakoutGroupId: "bg-1" }],
          },
        ],
      })
    ).toBe("Pending")
  })
})
