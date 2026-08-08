// @vitest-environment jsdom
import * as React from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { RegistrationForm } from "@/app/events/[id]/register/registration-form"

/**
 * What the walk-in form does once a submission lands.
 *
 * The regression these pin: the door's success screen used to offer exactly one
 * action — "Back to check-in" — so a staffer working a queue was thrown out to the
 * board and had to re-open the form for every person. The next walk-in is standing
 * right there; a blank form is the primary action, and the way back is secondary.
 *
 * The reset itself is the other half: the prefilled mobile that seeded this
 * submission, and every answer typed after it, must be gone before the next
 * person's turn — otherwise the door quietly files them under the last person's
 * details.
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

beforeAll(() => {
  // Radix probes for all of these in jsdom.
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
  // Nobody on file: the form registers the typed details rather than branching
  // into the "is this you?" confirm screen.
  lookupMemberForRegistration.mockResolvedValue(null)
  createRegistrant.mockReset()
  createRegistrant.mockResolvedValue({ success: true, data: { breakoutGroup: null } })
  registerForCluster.mockReset()
  registerForCluster.mockResolvedValue({
    success: true,
    data: {
      results: [
        {
          eventId: "e1",
          eventName: "Sunday Service",
          status: "registered",
          checkedIn: true,
          breakoutGroup: null,
        },
      ],
    },
  })
})

const WALK_IN = {
  occurrenceId: null,
  prefill: { mobileNumber: "+63 917 111 2222" },
  backHref: "/cluster/c1/checkin",
}

function renderForm(walkIn?: typeof WALK_IN) {
  return render(
    <RegistrationForm
      cluster={{ token: "tok-1", events: [{ id: "e1", name: "Sunday Service" }] }}
      eventName="Event Day"
      walkIn={walkIn}
    />
  )
}

const renderWalkInForm = () => renderForm(WALK_IN)
/** The same shared form on its public route, where no door is involved. */
const renderPublicForm = () => renderForm()

const firstNameInput = () => screen.getByLabelText(/First Name/) as HTMLInputElement
const lastNameInput = () => screen.getByLabelText(/Last Name/) as HTMLInputElement
const mobileInput = () => screen.getByLabelText(/Mobile/) as HTMLInputElement

/** Personal → Events → submit, for a person nobody has on file. */
async function submitOnce(firstName: string, lastName: string) {
  fireEvent.change(firstNameInput(), { target: { value: firstName } })
  fireEvent.change(lastNameInput(), { target: { value: lastName } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  fireEvent.click(await screen.findByRole("checkbox", { name: /Sunday Service/ }))
  fireEvent.click(screen.getByRole("checkbox", { name: /I agree to/ }))
  // "Register & Check In" at the door, plain "Register" on the public form.
  fireEvent.click(screen.getByRole("button", { name: /^Register( & Check In)?$/ }))

  await screen.findByText("Registered · checked in")
}

describe("walk-in form — after a submission", () => {
  it("offers a blank form as the primary action, not just the way back", async () => {
    renderWalkInForm()
    await submitOnce("Juan", "dela Cruz")

    expect(screen.getByRole("button", { name: "Register another walk-in" })).toBeDefined()
    // Still reachable — the queue does end.
    expect(
      screen.getByRole("link", { name: "Back to check-in" }).getAttribute("href")
    ).toBe("/cluster/c1/checkin")
  })

  it("puts a blank form back up, clearing the mobile the walk-in was seeded with", async () => {
    renderWalkInForm()
    await submitOnce("Juan", "dela Cruz")

    fireEvent.click(screen.getByRole("button", { name: "Register another walk-in" }))

    await waitFor(() => expect(firstNameInput()).toBeDefined())
    expect(firstNameInput().value).toBe("")
    expect(lastNameInput().value).toBe("")
    // The `?mobile=` prefill belonged to the person who just registered.
    expect(mobileInput().value).toBe("")
  })

  it("registers the next person on their own details, not the last one's", async () => {
    renderWalkInForm()
    await submitOnce("Juan", "dela Cruz")
    fireEvent.click(screen.getByRole("button", { name: "Register another walk-in" }))
    await waitFor(() => expect(firstNameInput().value).toBe(""))

    await submitOnce("Maria", "Santos")

    expect(registerForCluster).toHaveBeenCalledTimes(2)
    const [, payload] = registerForCluster.mock.calls[1]
    expect(payload).toMatchObject({ firstName: "Maria", lastName: "Santos" })
    expect(payload.mobileNumber).toBe("")
  })

  // The event ticks are per-person too — a second walk-in must choose their own
  // events rather than inheriting the previous submission's selection.
  it("clears the event selection so the next person picks their own", async () => {
    renderWalkInForm()
    await submitOnce("Juan", "dela Cruz")
    fireEvent.click(screen.getByRole("button", { name: "Register another walk-in" }))

    fireEvent.change(await screen.findByLabelText(/First Name/), {
      target: { value: "Maria" },
    })
    fireEvent.change(lastNameInput(), { target: { value: "Santos" } })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    const tick = await screen.findByRole("checkbox", { name: /Sunday Service/ })
    expect(tick.getAttribute("aria-checked")).toBe("false")
  })

  // A single event's door (`/events/[id]/walk-in`) lands on the other success
  // screen — one event, no per-event outcome list — and needs the same way on.
  it("resets a single event's door form too, not just the cluster day's", async () => {
    render(
      <RegistrationForm eventId="e1" eventName="Sunday Service" walkIn={WALK_IN} />
    )

    fireEvent.change(firstNameInput(), { target: { value: "Juan" } })
    fireEvent.change(lastNameInput(), { target: { value: "dela Cruz" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree to/ }))
    fireEvent.click(screen.getByRole("button", { name: "Register & Check In" }))

    fireEvent.click(await screen.findByRole("button", { name: "Register another walk-in" }))

    await waitFor(() => expect(firstNameInput().value).toBe(""))
    expect(mobileInput().value).toBe("")
  })

  it("keeps the public form's own wording when there is no door involved", async () => {
    renderPublicForm()
    await submitOnce("Juan", "dela Cruz")

    expect(screen.getByRole("button", { name: "Register another person" })).toBeDefined()
    expect(screen.queryByRole("link", { name: "Back to check-in" })).toBeNull()
  })
})
