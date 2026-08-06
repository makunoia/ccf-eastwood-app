// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

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

function renderTable(rows: AttendeeRow[], canEdit = true) {
  // The app mounts the provider in the event-workspace layout; the table only consumes it.
  return render(
    <TooltipProvider>
      <SessionAttendeesTable
        eventId="evt-1"
        occurrenceId="occ-1"
        attendees={rows}
        breakoutGroups={[]}
        breakoutStats={[]}
        volunteerOptions={[]}
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
