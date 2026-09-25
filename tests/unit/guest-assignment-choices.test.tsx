// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { GuestAssignmentMenu } from "@/components/guest-assignment-menu"
import { AssignGuestNowDialog } from "@/components/assign-guest-now-dialog"
import { GuestMatchSection } from "@/app/(dashboard)/guests/[id]/guest-match-section"

const { promoteGuestToMember, refresh } = vi.hoisted(() => ({
  promoteGuestToMember: vi.fn(async () => ({ success: true, data: { memberId: "member-1" } })),
  refresh: vi.fn(),
}))

vi.mock("@/app/(dashboard)/guests/actions", () => ({ promoteGuestToMember }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("guest assignment choices", () => {
  it("offers both paths when the admin can promote and only the request path otherwise", async () => {
    const assignNow = vi.fn()
    const request = vi.fn()
    const view = render(
      <GuestAssignmentMenu canAssignNow canRequestConfirmation onAssignNow={assignNow} onRequestConfirmation={request} />
    )
    fireEvent.pointerDown(screen.getByRole("button", { name: "Assign guest" }), { button: 0, ctrlKey: false })
    expect(screen.getByRole("menuitem", { name: /Assign now/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("menuitem", { name: /Request confirmation/ }))
    expect(request).toHaveBeenCalledOnce()
    expect(assignNow).not.toHaveBeenCalled()

    view.rerender(
      <GuestAssignmentMenu canAssignNow={false} canRequestConfirmation onAssignNow={assignNow} onRequestConfirmation={request} />
    )
    fireEvent.pointerDown(screen.getByRole("button", { name: "Assign guest" }), { button: 0, ctrlKey: false })
    expect(screen.queryByRole("menuitem", { name: /Assign now/ })).toBeNull()
    expect(screen.getByRole("menuitem", { name: /Request confirmation/ })).toBeTruthy()

    view.rerender(
      <GuestAssignmentMenu canAssignNow={false} canRequestConfirmation={false} onAssignNow={assignNow} onRequestConfirmation={request} />
    )
    expect(screen.queryByRole("button", { name: "Assign guest" })).toBeNull()
  })

  it("confirms the named guest and group before promoting with today's date", async () => {
    const onOpenChange = vi.fn()
    render(
      <AssignGuestNowDialog
        guestId="guest-1"
        guestName="Ella Santos"
        target={{ id: "group-1", name: "Ortigas" }}
        onOpenChange={onOpenChange}
      />
    )

    expect(screen.getByRole("dialog").textContent).toContain("Ella Santos")
    expect(screen.getByRole("dialog").textContent).toContain("Ortigas")
    expect(promoteGuestToMember).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Promote and assign" }))
    await waitFor(() => expect(promoteGuestToMember).toHaveBeenCalledWith("guest-1", "group-1"))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it("offers immediate assignment for a pending Guest when promotion is permitted", () => {
    const props = {
      guestId: "guest-1",
      guestName: "Ella Santos",
      pipelineStatus: "Pending" as const,
      claimedGroup: null,
      claimedSatellite: null,
      pendingGroupName: "Ortigas",
      pendingGroupId: "group-1",
      matchedBreakout: null,
      initialPrefs: {
        lifeStageId: "", gender: "", language: [], workCity: "", workIndustry: "",
        meetingPreference: "", scheduleDayOfWeek: "", scheduleTimeStart: "", scheduleTimeEnd: "",
      },
      lifeStages: [],
    }
    const view = render(<GuestMatchSection {...props} canAssignNow canRequestConfirmation />)
    expect(screen.getByRole("button", { name: "Assign now" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Assign now" }))
    expect(screen.getByRole("dialog").textContent).toContain("Ortigas")

    view.rerender(<GuestMatchSection {...props} canAssignNow={false} canRequestConfirmation />)
    expect(screen.queryByRole("button", { name: "Assign now" })).toBeNull()
  })
})
