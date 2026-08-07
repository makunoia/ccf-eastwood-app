import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { updateVolunteer } from "@/app/(dashboard)/volunteers/actions"

/**
 * CCF-35: Hide volunteer leader approval link section once volunteer is confirmed.
 *
 * UI rule: when volunteer.status === "Confirmed", the approval link/copy button
 * section is hidden and a "Confirmed" state indicator is shown instead.
 *
 * These tests verify that:
 * 1. The condition logic (`status === "Confirmed"`) correctly maps to link visibility.
 * 2. updateVolunteer persists Confirmed status correctly.
 * 3. Regression: Pending volunteers retain their leaderApprovalToken.
 */

// --- helpers ---

/** Mirrors the UI logic: returns true when the approval link should be shown. */
function shouldShowApprovalLink(status: "Pending" | "Confirmed" | "Rejected"): boolean {
  return status !== "Confirmed"
}

// --- seed helpers ---
let memberId: string
let eventId: string
let committeeId: string
let roleId: string

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "Member", "LifeStage" RESTART IDENTITY CASCADE`

  const member = await db.member.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      language: [],
      dateJoined: new Date(),
    },
  })
  memberId = member.id

  const event = await db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
    },
  })
  eventId = event.id

  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushers", eventId },
  })
  committeeId = committee.id

  const role = await db.committeeRole.create({
    data: { name: "Door Greeter", committeeId },
  })
  roleId = role.id
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-35", () => {
  describe("unit — approval link visibility logic", () => {
    it("hides approval link when status is Confirmed", () => {
      expect(shouldShowApprovalLink("Confirmed")).toBe(false)
    })

    it("shows approval link when status is Pending", () => {
      expect(shouldShowApprovalLink("Pending")).toBe(true)
    })

    it("shows approval link when status is Rejected", () => {
      expect(shouldShowApprovalLink("Rejected")).toBe(true)
    })
  })

  describe("integration — updateVolunteer persists Confirmed status", () => {
    it("saves Confirmed status correctly", async () => {
      const created = await db.volunteer.create({
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId: roleId,
          status: "Pending",
          leaderApprovalToken: crypto.randomUUID(),
        },
      })

      const result = await updateVolunteer(created.id, {
        memberId,
        eventId,
        committeeId,
        preferredRoleId: roleId,
        assignedRoleId: "",
        status: "Confirmed",
        notes: "",
      })

      expect(result.success).toBe(true)

      const updated = await db.volunteer.findUnique({ where: { id: created.id } })
      expect(updated?.status).toBe("Confirmed")
    })
  })

  describe("regression — Pending volunteer retains approval token", () => {
    it("leaderApprovalToken is not cleared when status remains Pending", async () => {
      const token = crypto.randomUUID()
      const created = await db.volunteer.create({
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId: roleId,
          status: "Pending",
          leaderApprovalToken: token,
        },
      })

      await updateVolunteer(created.id, {
        memberId,
        eventId,
        committeeId,
        preferredRoleId: roleId,
        assignedRoleId: "",
        status: "Pending",
        notes: "updated note",
      })

      const updated = await db.volunteer.findUnique({ where: { id: created.id } })
      expect(updated?.leaderApprovalToken).toBe(token)
    })
  })
})
