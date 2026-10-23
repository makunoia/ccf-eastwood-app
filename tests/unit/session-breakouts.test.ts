import { describe, expect, it } from "vitest"
import { sessionBreakoutDetails, sessionBreakoutSnapshotSchema, type SessionBreakoutSnapshot } from "@/lib/exports/session-breakouts"
import { buildSessionAttendanceColumns } from "@/lib/exports/session-attendance"

const group = {
  name: "Table 1", registrantIds: ["registration"], memberIds: ["member"], guestIds: ["guest"],
  facilitator: null, coFacilitator: null,
}
const snapshot: SessionBreakoutSnapshot = { version: 1, capturedAt: "2026-10-23T01:00:00Z", groups: [group] }

describe("session breakout history", () => {
  it("does not manufacture history for a missing or unrecognized record", () => {
    expect(sessionBreakoutSnapshotSchema.safeParse(null).success).toBe(false)
    expect(sessionBreakoutSnapshotSchema.safeParse({ ...snapshot, version: 2 }).success).toBe(false)
    expect(sessionBreakoutDetails(null, { memberId: "member" })).toEqual({ breakoutGroup: null, facilitator: null, coFacilitator: null })
  })

  it("keeps a promoted guest's saved assignment through the stable registration id", () => {
    expect(sessionBreakoutDetails(snapshot, { id: "registration", memberId: "new-member", guestId: null }).breakoutGroup).toBe("Table 1")
    expect(sessionBreakoutDetails(snapshot, { guestId: "guest" }).breakoutGroup).toBe("Table 1")
  })

  it("does not offer fake staff names when multiple matching tables have no staff", () => {
    const details = sessionBreakoutDetails({ ...snapshot, groups: [group, { ...group, name: "Table 2" }] }, { memberId: "member" })
    expect(details).toEqual({ breakoutGroup: "Table 1; Table 2", facilitator: null, coFacilitator: null })
    const columns = buildSessionAttendanceColumns([{
      sessionDate: "2026-10-23", seriesTitle: null, firstName: "Test", lastName: "Person", nickname: null,
      mobile: "", email: null, type: "Member", checkedInAt: null, ...details,
    }])
    expect(columns.map((c) => c.key)).not.toContain("facilitator")
    expect(columns.map((c) => c.key)).not.toContain("coFacilitator")
  })

  it("aligns staff with each matching table and resolves a volunteer through member identity", () => {
    const staffed = { ...group, facilitator: { memberId: "staff", name: "Lead Person" } }
    expect(sessionBreakoutDetails({ ...snapshot, groups: [staffed] }, { memberId: "staff" })).toEqual({
      breakoutGroup: "Table 1", facilitator: "Lead Person", coFacilitator: null,
    })
    expect(sessionBreakoutDetails({ ...snapshot, groups: [group, { ...staffed, name: "Table 2" }] }, { memberId: "member" })).toEqual({
      breakoutGroup: "Table 1; Table 2", facilitator: "; Lead Person", coFacilitator: null,
    })
  })
})
