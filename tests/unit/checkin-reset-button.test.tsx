// @vitest-environment jsdom
import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { CheckinBoard } from "@/app/events/[id]/checkin/checkin-board"
import { ClusterCheckinBoard } from "@/app/register/c/[token]/check-in/cluster-checkin-board"

/**
 * How the door gets back to a blank lookup.
 *
 * Both boards used to clear themselves on a 4-second timer: the success screen
 * said "Returning to start in a moment…" and then vanished on its own. That
 * makes the kiosk race the person standing at it — a family reading their
 * breakout group, or a staffer confirming what was recorded, loses the screen
 * mid-sentence, and there is no way to ask for it back. The reset is now an
 * explicit tap, so the screen holds until someone is done with it.
 */

const {
  lookupCheckinRegistrant,
  searchCheckinByName,
  markCheckinAttendance,
  getRegistrantBreakoutGroupName,
  lookupClusterCheckin,
  checkInToCluster,
} = vi.hoisted(() => ({
  lookupCheckinRegistrant: vi.fn(),
  searchCheckinByName: vi.fn(),
  markCheckinAttendance: vi.fn(),
  getRegistrantBreakoutGroupName: vi.fn(),
  lookupClusterCheckin: vi.fn(),
  checkInToCluster: vi.fn(),
}))

vi.mock("@/app/(dashboard)/events/actions", () => ({
  lookupCheckinRegistrant,
  searchCheckinByName,
  markCheckinAttendance,
  checkInToOccurrence: vi.fn(),
  lookupHouseholdForCheckin: vi.fn(),
  checkInHousehold: vi.fn(),
  addHouseholdMemberAtCheckin: vi.fn(),
  recordSmallGroupInterestAtCheckin: vi.fn(),
  saveCheckinMatchingProfile: vi.fn(),
  saveCheckinClaimedGroup: vi.fn(),
}))
vi.mock("@/app/(dashboard)/events/breakout-actions", () => ({
  autoAssignRegistrantToBreakout: vi.fn(),
  getRegistrantBreakoutGroupName,
}))
vi.mock("@/app/(dashboard)/guests/actions", () => ({
  searchMembersForLeaderLookup: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock("@/app/(dashboard)/events/cluster-actions", () => ({
  lookupClusterCheckin,
  checkInToCluster,
  searchClusterCheckinByName: vi.fn(async () => ({ success: true, data: [] })),
}))

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
  vi.useFakeTimers({ shouldAdvanceTime: true })
  lookupCheckinRegistrant.mockReset()
  markCheckinAttendance.mockReset()
  markCheckinAttendance.mockResolvedValue({ success: true, data: null })
  getRegistrantBreakoutGroupName.mockReset()
  getRegistrantBreakoutGroupName.mockResolvedValue(null)
  lookupClusterCheckin.mockReset()
  checkInToCluster.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Long enough that any of the old 4s timers would have fired. */
async function waitOutTheOldTimer() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
  })
}

// ── Event check-in board ─────────────────────────────────────────────────────

const MATCHED_PERSON = {
  kind: "registrant" as const,
  subjectId: "r1",
  name: "Juan dela Cruz",
  nickname: null,
  contactHint: "+63 917 111 2222",
  smallGroupPrompt: null,
  alreadyCheckedIn: false,
}

/** Mobile lookup → confirm → checked in. */
async function checkInOnEventBoard() {
  lookupCheckinRegistrant.mockResolvedValue({ success: true, data: MATCHED_PERSON })
  render(<CheckinBoard eventId="e1" occurrenceId={null} />)

  fireEvent.change(screen.getByLabelText("Mobile number"), {
    target: { value: "+63 917 111 2222" },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Find my registration" }))
  })
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Yes, check me in" }))
  })
  await screen.findByText("You're checked in.")
}

describe("event check-in board — after checking someone in", () => {
  it("holds the success screen instead of clearing itself on a timer", async () => {
    await checkInOnEventBoard()

    await waitOutTheOldTimer()

    expect(screen.getByText("You're checked in.")).toBeDefined()
    expect(screen.queryByLabelText("Mobile number")).toBeNull()
  })

  it("returns to a blank lookup when the button is tapped", async () => {
    await checkInOnEventBoard()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check in someone else" }))
    })

    const mobile = screen.getByLabelText("Mobile number") as HTMLInputElement
    expect(mobile.value).toBe("")
    expect((screen.getByLabelText("Search by name") as HTMLInputElement).value).toBe("")
  })

  // The already-checked-in screen shared the same timer. It has always carried a
  // "Done" button, so removing the timer only means it stops disappearing on its own.
  it("holds the already-checked-in screen until Done is tapped", async () => {
    lookupCheckinRegistrant.mockResolvedValue({
      success: true,
      data: { ...MATCHED_PERSON, alreadyCheckedIn: true },
    })
    render(<CheckinBoard eventId="e1" occurrenceId={null} />)

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+63 917 111 2222" },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Find my registration" }))
    })
    await screen.findByText("Already checked in")

    await waitOutTheOldTimer()
    expect(screen.getByText("Already checked in")).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }))
    })
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe("")
  })
})

// ── Cluster check-in board ───────────────────────────────────────────────────

const CLUSTER_PERSON = {
  key: "guest:g1",
  name: "Juan dela Cruz",
  nickname: null,
  contactHint: "+63 917 111 2222",
  isMember: false,
  events: [
    {
      eventId: "e1",
      eventName: "Sunday Service",
      subject: { kind: "registrant" as const, id: "r1" },
      alreadyCheckedIn: false,
      status: "open" as const,
    },
  ],
}

async function checkInOnClusterBoard() {
  lookupClusterCheckin.mockResolvedValue({
    success: true,
    data: { matchType: "single", person: CLUSTER_PERSON },
  })
  checkInToCluster.mockResolvedValue({
    success: true,
    data: { person: CLUSTER_PERSON, recorded: ["e1"] },
  })
  render(<ClusterCheckinBoard token="tok-1" walkInHref={null} />)

  fireEvent.change(screen.getByLabelText("Mobile number"), {
    target: { value: "+63 917 111 2222" },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Find me" }))
  })
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Yes, check me in (1)" }))
  })
  await screen.findByText("You're checked in for 1 event.")
}

describe("cluster check-in board — after checking someone in", () => {
  it("holds the success screen instead of clearing itself on a timer", async () => {
    await checkInOnClusterBoard()

    await waitOutTheOldTimer()

    expect(screen.getByText("You're checked in for 1 event.")).toBeDefined()
  })

  it("returns to a blank lookup when the button is tapped", async () => {
    await checkInOnClusterBoard()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check in someone else" }))
    })

    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe("")
  })
})
