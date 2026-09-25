// @vitest-environment jsdom
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { InterestTracker, type InterestRow } from "@/app/(event)/event/[id]/catch-mech/interest-tracker"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/(event)/event/[id]/catch-mech/interest-actions", () => ({
  assignCatchMechInterest: vi.fn(),
  dismissCatchMechInterest: vi.fn(),
  getCatchMechInterestMatches: vi.fn(),
}))

const createdAt = new Date("2026-08-01T12:00:00Z")
const rows: InterestRow[] = [
  { id: "1", createdAt, personName: "Awaiting Person", personType: "Guest", personId: "g1", status: "Pending", groupId: null, groupName: null },
  { id: "2", createdAt, personName: "Assigned Person", personType: "Guest", personId: "g2", status: "Pending", groupId: "sg1", groupName: "Ortigas" },
  { id: "3", createdAt, personName: "Confirmed Person", personType: "Member", personId: "m1", status: "Confirmed", groupId: "sg1", groupName: "Ortigas" },
  { id: "4", createdAt, personName: "Dismissed Person", personType: "Guest", personId: "g3", status: "Rejected", groupId: null, groupName: null },
  { id: "5", createdAt, personName: "Declined Person", personType: "Guest", personId: "g4", status: "Rejected", groupId: "sg1", groupName: "Ortigas" },
]

describe("Catch Mech DGroup interest tracker", () => {
  it("names each stage of the request and keeps resolved rows visible", () => {
    render(<InterestTracker eventId="e1" rows={rows} canManage={false} canViewMembers={false} canViewGuests={false} />)

    expect(screen.getByText("1 awaiting placement")).toBeDefined()
    expect(screen.getAllByText("Awaiting placement", { exact: false }).length).toBeGreaterThan(1)
    expect(screen.getByText("Awaiting leader confirmation", { exact: false })).toBeDefined()
    expect(screen.getByText("Placed", { exact: false })).toBeDefined()
    expect(screen.getAllByText("Dismissed", { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Declined", { exact: false }).length).toBeGreaterThan(0)
  })
})
