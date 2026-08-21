// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { ClusterCheckinBoard } from "@/app/register/c/[token]/check-in/cluster-checkin-board"
import type { ClusterCheckinPerson } from "@/lib/clusters/checkin-person"

/**
 * The collab day's check-in kiosk (CCF-148).
 *
 * Every assertion here is about something the screen must NOT say. A collab is one
 * event to everyone attending, and a registrant belongs to exactly one member event
 * — their ministry's — so naming the day's events re-exposes the split the day
 * exists to hide. The worst case is the one pinned below: the partner ministry's
 * event, which this person was never meant to join, rendering as "Not registered"
 * beside their name at the moment they check in.
 *
 * The write is unchanged and deliberately untested here — `checkInToCluster` records
 * the same cells whichever kind the day is. This is a presentation contract.
 */

vi.mock("@/app/(dashboard)/events/cluster-actions", () => ({
  lookupClusterCheckin: vi.fn(),
  searchClusterCheckinByName: vi.fn(),
  checkInToCluster: vi.fn(),
}))

const { lookupClusterCheckin, searchClusterCheckinByName, checkInToCluster } =
  await import("@/app/(dashboard)/events/cluster-actions")

/** Registered to Youth Night only — the shape every collab registrant has. */
function person(overrides?: Partial<ClusterCheckinPerson>): ClusterCheckinPerson {
  return {
    key: "member:m1",
    name: "Maria Cruz",
    nickname: null,
    contactHint: "•••• 2222",
    isMember: true,
    events: [
      {
        eventId: "e-youth",
        eventName: "Youth Night",
        subject: { kind: "registrant", id: "r1" },
        alreadyCheckedIn: false,
        status: "open",
      },
      {
        eventId: "e-singles",
        eventName: "Singles Connect",
        subject: null,
        alreadyCheckedIn: false,
        status: "open",
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(searchClusterCheckinByName).mockResolvedValue({
    success: true,
    data: [person()],
  })
})

async function searchAndSelect(kind: "Parallel" | "Collab") {
  render(<ClusterCheckinBoard token="tok-1" kind={kind} walkInHref="/register/c/tok-1/walk-in" />)
  fireEvent.change(screen.getByLabelText("Search by name"), {
    target: { value: "Maria" },
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350))
  })
  await act(async () => {
    fireEvent.click(await screen.findByText("Maria Cruz"))
  })
}

describe("collab check-in — the confirm screen", () => {
  it("names neither member event", async () => {
    await searchAndSelect("Collab")
    expect(screen.getByText("Maria Cruz")).toBeTruthy()
    expect(screen.queryByText("Youth Night")).toBeNull()
    expect(screen.queryByText("Singles Connect")).toBeNull()
  })

  it("never shows 'Not registered' for the ministry they don't belong to", async () => {
    await searchAndSelect("Collab")
    expect(screen.queryByText("Not registered")).toBeNull()
  })

  it("offers a plain 'Check me in' with no count", async () => {
    await searchAndSelect("Collab")
    expect(screen.getByRole("button", { name: "Check me in" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /check me in \(/i })).toBeNull()
  })

  it("still shows the breakdown on a parallel day", async () => {
    await searchAndSelect("Parallel")
    expect(screen.getByText("Youth Night")).toBeTruthy()
    expect(screen.getByText("Singles Connect")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Yes, check me in (1)" })).toBeTruthy()
  })
})

describe("collab check-in — the welcome screen", () => {
  it("welcomes without counting events", async () => {
    vi.mocked(checkInToCluster).mockResolvedValue({
      success: true,
      data: {
        person: person(),
        recorded: [{ eventId: "e-youth", eventName: "Youth Night" }],
        skipped: [],
        breakoutSubject: null,
      },
    })
    await searchAndSelect("Collab")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check me in" }))
    })

    expect(screen.getByText(/Welcome, Maria/)).toBeTruthy()
    expect(screen.getByText(/You're all set/)).toBeTruthy()
    expect(screen.queryByText(/checked in for 1 event/)).toBeNull()
    expect(screen.queryByText("Youth Night")).toBeNull()
    // The reset — the kiosk is a shared device, so the next person starts clean.
    expect(screen.getByRole("button", { name: "Check in someone else" })).toBeTruthy()
  })

  it("says so plainly when they were already checked in", async () => {
    const seated = person({
      events: [
        {
          eventId: "e-youth",
          eventName: "Youth Night",
          subject: { kind: "registrant", id: "r1" },
          alreadyCheckedIn: true,
          status: "open",
        },
      ],
    })
    vi.mocked(searchClusterCheckinByName).mockResolvedValue({ success: true, data: [seated] })
    vi.mocked(checkInToCluster).mockResolvedValue({
      success: true,
      data: {
        person: seated,
        recorded: [],
        skipped: [{ eventId: "e-youth", eventName: "Youth Night", reason: "already" }],
        breakoutSubject: null,
      },
    })
    await searchAndSelect("Collab")

    // Not a dead end: the write is idempotent, so the tap still leads to a welcome.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check me in" }))
    })
    expect(screen.getByText("You were already checked in.")).toBeTruthy()
  })
})

describe("collab check-in — genuine dead ends", () => {
  it("says why, and points at the door, when there is no registration", async () => {
    const stranger = person({
      events: [
        {
          eventId: "e-youth",
          eventName: "Youth Night",
          subject: null,
          alreadyCheckedIn: false,
          status: "open",
        },
      ],
    })
    vi.mocked(searchClusterCheckinByName).mockResolvedValue({ success: true, data: [stranger] })
    await searchAndSelect("Collab")

    // With no cell list to infer a reason from, the reason has to be said out loud.
    expect(screen.getByText(/don't have a registration for you today/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Register now" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Nothing to check in" })).toBeTruthy()
  })

  it("sends them to staff when their event isn't taking check-ins", async () => {
    const closed = person({
      events: [
        {
          eventId: "e-youth",
          eventName: "Youth Night",
          subject: { kind: "registrant", id: "r1" },
          alreadyCheckedIn: false,
          status: "formClosed",
        },
      ],
    })
    vi.mocked(searchClusterCheckinByName).mockResolvedValue({ success: true, data: [closed] })
    await searchAndSelect("Collab")

    expect(screen.getByText(/ask a staff member/)).toBeTruthy()
    expect(screen.queryByText("Check-in closed")).toBeNull()
  })
})

describe("collab check-in — telling same-name people apart", () => {
  it("leans on the masked contact hint, not an event count", async () => {
    vi.mocked(lookupClusterCheckin).mockResolvedValue({ success: true, data: null })
    render(<ClusterCheckinBoard token="tok-1" kind="Collab" walkInHref={null} />)
    fireEvent.change(screen.getByLabelText("Search by name"), {
      target: { value: "Maria" },
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })

    expect(await screen.findByText("•••• 2222")).toBeTruthy()
    // "1 of 2 events" would be identical for every collab candidate anyway.
    expect(screen.queryByText(/of 2 events/)).toBeNull()
  })
})
