// @vitest-environment jsdom
import * as React from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { RegistrationForm } from "@/app/events/[id]/register/registration-form"

/**
 * What a Collab day's shared form says once the submission lands.
 *
 * A collab is one event to the person in front of the screen, so the outcome is
 * collapsed to the day's name. The regressions pinned here are both about that
 * collapsed card telling the truth:
 *
 *  - A **volunteer** is on the list. They don't register as attendees, which is
 *    exactly what the single-event form's own screen says — but the collapsed
 *    card counted only registrations, so the one outcome needing no action at all
 *    was shown as a failure with "please ask the team for help".
 *  - A **refusal** used to render an empty card under that same line, so the
 *    person was told to go and ask the team without ever being told why.
 */

const { registerForCluster, createRegistrant, lookupMemberForRegistration } = vi.hoisted(() => ({
  registerForCluster: vi.fn(),
  createRegistrant: vi.fn(),
  lookupMemberForRegistration: vi.fn(),
}))

vi.mock("@/app/(dashboard)/events/cluster-actions", () => ({ registerForCluster }))
vi.mock("@/app/(dashboard)/events/actions", () => ({
  lookupMemberForRegistration,
  createRegistrant,
  createHouseholdRegistration: vi.fn(),
}))
vi.mock("@/app/(dashboard)/guests/actions", () => ({
  searchMembersForLeaderLookup: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock("@/app/(dashboard)/events/registration-lookup-actions", () => ({
  lookupProfileByMobile: vi.fn(async () => ({ outcome: "none" })),
  revealProfileForRegistration: vi.fn(async () => ({ ok: false, reason: "notFound" })),
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
  lookupMemberForRegistration.mockReset()
  lookupMemberForRegistration.mockResolvedValue(null)
  registerForCluster.mockReset()
})

const DAY = {
  token: "tok-1",
  kind: "Collab" as const,
  name: "Youth × Singles Night",
  events: [
    { id: "e1", name: "Youth Night", ministry: { id: "m1", name: "Youth", logoUrl: null } },
    { id: "e2", name: "Singles Connect", ministry: { id: "m2", name: "Singles", logoUrl: null } },
  ],
}

function renderDay() {
  return render(
    <RegistrationForm cluster={DAY} eventName={DAY.name} />
  )
}

/** Gate → Personal → Ministry → submit. */
async function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Start a new registration" }))
  fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: "Maria" } })
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Cruz" } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  fireEvent.click(await screen.findByRole("radio", { name: /Youth/ }))
  fireEvent.click(screen.getByRole("checkbox", { name: /I agree to/ }))
  fireEvent.click(screen.getByRole("button", { name: /^Register$/ }))
}

function outcome(status: string, extra: Record<string, unknown> = {}) {
  registerForCluster.mockResolvedValue({
    success: true,
    data: {
      results: [
        { eventId: "e1", eventName: "Youth Night", status, breakoutGroup: null, ...extra },
      ],
    },
  })
}

describe("the collapsed collab outcome card", () => {
  it("welcomes a volunteer instead of reporting a failure", async () => {
    outcome("volunteer")
    renderDay()
    await submit()

    expect(await screen.findByText(/You're already on the list, Maria!/)).toBeDefined()
    expect(screen.queryByText(/please ask the team for help/)).toBeNull()
    // The day's name, never the member events' — the split is what a collab hides.
    expect(screen.getByText("Youth × Singles Night")).toBeDefined()
    expect(screen.queryByText("Youth Night")).toBeNull()
  })

  it("names the reason when the day could not take the registration", async () => {
    outcome("closed")
    renderDay()
    await submit()

    expect(await screen.findByText("Here's where things stand")).toBeDefined()
    expect(screen.getByText("Registration for this event is closed")).toBeDefined()
  })

  it("still reads as good news when the registration landed", async () => {
    outcome("registered")
    renderDay()
    await submit()

    expect(await screen.findByText(/You're all set, Maria!/)).toBeDefined()
    expect(screen.getByText("Registered")).toBeDefined()
  })
})
