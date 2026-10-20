// @vitest-environment jsdom
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CatchMechConfirmClient } from "@/app/events/[id]/catch-mech/[token]/catch-mech-confirm-client"
import { VolunteerPlacementForm } from "@/app/events/[id]/catch-mech/volunteers/[token]/volunteer-placement-form"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"
import { submitCatchMechVolunteerPlacements } from "@/app/events/[id]/catch-mech/volunteers/actions"

vi.mock("@/app/events/[id]/catch-mech/actions", () => ({
  submitCatchMechConfirmations: vi.fn().mockResolvedValue({ success: true, requiresGroupName: false }),
  createSmallGroupForTimothy: vi.fn(),
}))
vi.mock("@/app/events/[id]/catch-mech/volunteers/actions", () => ({
  searchCatchMechVolunteerParticipants: vi.fn(),
  submitCatchMechVolunteerPlacements: vi.fn().mockResolvedValue({ success: true, data: { placedCount: 0, createdGroupId: null } }),
}))

describe("empty Catch Mech rosters", () => {
  it("lets a facilitator submit a response without exposing first-timers", async () => {
    render(<CatchMechConfirmClient token="faci" groupName="Table" isTimothy candidates={[]} rows={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Submit no placements" }))
    await waitFor(() => expect(submitCatchMechConfirmations).toHaveBeenCalledWith("faci", []))
    await screen.findByText("Done!")
  })
  it("lets a volunteer submit a response when no participants are eligible", async () => {
    render(<VolunteerPlacementForm token="volunteer" volunteerName="Ana" hasEligibleParticipants={false} groups={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Submit no placements" }))
    await waitFor(() => expect(submitCatchMechVolunteerPlacements).toHaveBeenCalledWith("volunteer", [], undefined))
    await screen.findByText("Your response has been recorded.")
  })
})
