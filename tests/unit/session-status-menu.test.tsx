// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import type { SessionRegistrationRow } from "@/app/(event)/event/[id]/sessions/[occurrenceId]/session-registration-roster"

import { TooltipProvider } from "@/components/ui/tooltip"
import {
  SessionAttendeesTable,
  type AttendeeRow,
} from "@/app/(event)/event/[id]/sessions/[occurrenceId]/session-attendees-table"

/**
 * The New/Returning control on the session detail page.
 *
 * The regression these pin: both destinations must be *named on screen* once the control is
 * open. The previous version was a bare click-toggle whose only label lived in a hover
 * tooltip — invisible on the tablets sessions are actually run from, which left an admin who
 * misclicked "New" → "Returning" with no discoverable way back.
 */

// Hoisted so the mock factory below — which runs at import time, before module-level
// consts are initialised — can reference the same spy the assertions read.
const { setAttendeeReturnerStatus } = vi.hoisted(() => ({
  setAttendeeReturnerStatus: vi.fn(
    async (_attendeeId: string, _isReturner: boolean | null) => ({ success: true }) as const,
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock("@/app/(event)/event/[id]/sessions/[occurrenceId]/attendee-actions", () => ({
  setAttendeeReturnerStatus,
  removeSessionAttendee: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/app/(event)/event/[id]/sessions/[occurrenceId]/sub-facilitator-actions", () => ({
  assignSubFacilitator: vi.fn(async () => ({ success: true })),
  removeSubFacilitator: vi.fn(async () => ({ success: true })),
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
  setAttendeeReturnerStatus.mockClear()
})

function makeRow(overrides: Partial<AttendeeRow> = {}): AttendeeRow {
  return {
    id: "att-1",
    kind: "registrant",
    subjectId: "reg-1",
    name: "Gio Guest",
    checkedInAtFormatted: "09:05 AM",
    isReturner: false,
    derivedIsReturner: false,
    hasStatusOverride: false,
    isMember: false,
    isVolunteer: false,
    breakoutGroupIds: [],
    breakoutGroupNames: [],
    gender: null,
    ...overrides,
  }
}

function renderTable(
  rows: AttendeeRow[],
  canEdit = true,
  totalRegistrants = rows.length,
  sessionRegistrations: SessionRegistrationRow[] = [],
) {
  // The app mounts the provider in the event-workspace layout; the table only consumes it.
  return render(
    <TooltipProvider>
      <SessionAttendeesTable
        eventId="evt-1"
        occurrenceId="occ-1"
        attendees={rows}
        sessionRegistrations={sessionRegistrations}
        breakoutGroups={[]}
        breakoutStats={[]}
        volunteerOptions={[]}
        totalRegistrants={totalRegistrants}
        canEdit={canEdit}
      />
    </TooltipProvider>,
  )
}

/** The desktop table and the mobile card list both render a trigger; either will do. */
function statusTrigger(currentStatus: "New" | "Returning") {
  return screen.getAllByRole("button", {
    name: `Status: ${currentStatus}. Change status.`,
  })[0]
}

function openMenu(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("session attendee status menu", () => {
  it("labels the trigger with the status the row currently has", () => {
    renderTable([makeRow()])
    expect(statusTrigger("New")).toBeDefined()
  })

  it("offers both New and Returning, with the current one checked", async () => {
    renderTable([makeRow({ isReturner: true, derivedIsReturner: true })])
    openMenu(statusTrigger("Returning"))

    const returning = await screen.findByRole("menuitemradio", { name: "Returning" })
    const isNew = await screen.findByRole("menuitemradio", { name: "New" })

    expect(returning.getAttribute("aria-checked")).toBe("true")
    expect(isNew.getAttribute("aria-checked")).toBe("false")
  })

  // The misclick recovery, end to end through the component: a guest wrongly pinned as
  // Returning is put back to New, and the write clears the override rather than pinning
  // the opposite value.
  it("clears the override when New is picked back on a derived-New guest", async () => {
    renderTable([makeRow({ isReturner: true, derivedIsReturner: false, hasStatusOverride: true })])
    openMenu(statusTrigger("Returning"))

    fireEvent.click(await screen.findByRole("menuitemradio", { name: "New" }))

    await waitFor(() => expect(setAttendeeReturnerStatus).toHaveBeenCalledWith("att-1", null))
    expect(statusTrigger("New")).toBeDefined()
  })

  it("pins Returning when it disagrees with the derived value", async () => {
    renderTable([makeRow()])
    openMenu(statusTrigger("New"))

    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Returning" }))

    await waitFor(() => expect(setAttendeeReturnerStatus).toHaveBeenCalledWith("att-1", true))
  })

  it("writes nothing when the already-checked status is picked again", async () => {
    renderTable([makeRow()])
    openMenu(statusTrigger("New"))

    fireEvent.click(await screen.findByRole("menuitemradio", { name: "New" }))

    await waitFor(() =>
      expect(screen.queryByRole("menuitemradio", { name: "New" })).toBeNull(),
    )
    expect(setAttendeeReturnerStatus).not.toHaveBeenCalled()
  })

  it("leaves members and volunteers as plain, non-interactive badges", () => {
    renderTable([
      makeRow({ id: "att-m", isMember: true, isReturner: true, derivedIsReturner: true }),
      makeRow({
        id: "att-v",
        kind: "volunteer",
        isMember: true,
        isVolunteer: true,
        isReturner: true,
        derivedIsReturner: true,
      }),
    ])

    expect(
      screen.queryByRole("button", { name: /^Status: .* Change status\.$/ }),
    ).toBeNull()
    expect(screen.getAllByText("Returning").length).toBeGreaterThan(0)
  })

  it("hides the control from read-only users", () => {
    renderTable([makeRow()], false)
    expect(
      screen.queryByRole("button", { name: /^Status: .* Change status\.$/ }),
    ).toBeNull()
  })
})

/** The session pool is the identity-deduplicated union of registrations and arrivals. */
describe("session turnout tile", () => {
  function makeAttendee(isVolunteer: boolean, i: number) {
    return makeRow({
      id: `a-${i}`,
      subjectId: `reg-${i}`,
      personKey: `member:${i}`,
      kind: isVolunteer ? "volunteer" : "registrant",
      name: `Person ${i}`,
      isVolunteer,
      isMember: true,
    })
  }

  function registrations(count: number): SessionRegistrationRow[] {
    return Array.from({ length: count }, (_, index) => ({
      registrantId: `reg-${index + 1}`,
      personKey: `member:${index + 1}`,
      name: `Person ${index + 1}`,
      isMember: true,
      checkedIn: false,
    }))
  }

  function expectTurnout(rate: string, ratio: string) {
    const bar = screen.getByRole("progressbar", { name: "Turnout" })
    expect(bar.getAttribute("aria-valuetext")).toBe(ratio)
    expect(within(bar.parentElement!).getByText(rate)).toBeDefined()
    return bar
  }

  it("uses session registrations rather than the series roster as its denominator", () => {
    renderTable([makeAttendee(false, 1), makeAttendee(false, 2)], true, 80, registrations(8))
    expectTurnout("25%", "2 of 8 checked in")
  })

  it("includes volunteers and walk-ins in both the numerator and the session pool", () => {
    renderTable(
      [makeAttendee(false, 1), makeAttendee(true, 5), makeAttendee(false, 6)],
      true,
      80,
      registrations(4),
    )
    expectTurnout("50%", "3 of 6 checked in")
  })

  it("shows full turnout for arrivals when nobody registered for the session", () => {
    renderTable([makeAttendee(false, 1)], true, 80)
    expectTurnout("100%", "1 of 1 checked in")
  })

  it("shows no rate when there are neither session registrations nor arrivals", async () => {
    renderTable([], true, 80)
    const bar = screen.getByRole("img", { name: "Turnout" })
    expect(within(bar.parentElement!).getByText("—")).toBeDefined()
    expect(bar.hasAttribute("aria-valuenow")).toBe(false)
    fireEvent.focus(bar)
    expect((await screen.findByRole("tooltip")).textContent).toBe("No registrations or check-ins yet")
  })

  it("shows registered people who have not checked in in the tooltip", async () => {
    renderTable([makeAttendee(false, 1)], true, 80, registrations(2))
    fireEvent.focus(expectTurnout("50%", "1 of 2 checked in"))
    expect((await screen.findByRole("tooltip")).textContent).toBe("1 of 2 checked in · 1 not checked in")
  })

  it("counts each person once across registration and attendance rows", () => {
    renderTable(
      [makeAttendee(false, 1), { ...makeAttendee(true, 1), id: "duplicate-arrival" }],
      true,
      80,
      [...registrations(2), { ...registrations(1)[0], registrantId: "duplicate-registration" }],
    )
    expectTurnout("50%", "1 of 2 checked in")
  })

  it("updates turnout when refreshed attendance props arrive", () => {
    const props = {
      eventId: "evt-1",
      occurrenceId: "occ-1",
      breakoutGroups: [],
      breakoutStats: [],
      volunteerOptions: [],
      totalRegistrants: 80,
      sessionRegistrations: registrations(2),
      canEdit: true,
    }
    const view = render(<TooltipProvider><SessionAttendeesTable {...props} attendees={[makeAttendee(false, 1)]} /></TooltipProvider>)
    expectTurnout("50%", "1 of 2 checked in")
    view.rerender(<TooltipProvider><SessionAttendeesTable {...props} attendees={[]} /></TooltipProvider>)
    expectTurnout("0%", "0 of 2 checked in")
  })
})
