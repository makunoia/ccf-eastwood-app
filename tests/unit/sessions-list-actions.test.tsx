// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  SessionsClient,
  type OccurrenceRow,
} from "@/app/(event)/event/[id]/sessions/sessions-client"

/**
 * The Sessions list.
 *
 * Two regressions these pin, from the same root: the desktop surface was a
 * `DataTable` whose whole action set lived in one 52px cell as bare icon
 * buttons — unlabelled, tooltip-only (which never fires on the tablets sessions
 * are run from), and clipped before the last was reachable.
 *
 *  1. Every action is **named on the surface or in a named menu**, in one copy of
 *     the markup at every width — no `lg:hidden` twin that can drift.
 *  2. The card holds **two visible controls at most**: the labelled check-in
 *     switch and, when the kiosk would actually admit someone, the check-in
 *     link. Everything rare is in the `⋯`. On a past session that link led to
 *     "Check-in not available", and a dead action is the most crowding thing on
 *     a card this size.
 */

/** The `today` the list is rendered against; occurrence dates are UTC days. */
const TODAY = "2026-08-22"

const { setOccurrenceCheckinOpen } = vi.hoisted(() => ({
  setOccurrenceCheckinOpen: vi.fn(async () => ({
    success: true as const,
    data: { walkInChanged: false },
  })),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock("@/app/(dashboard)/events/actions", () => ({
  setOccurrenceCheckinOpen,
  createOccurrence: vi.fn(async () => ({ success: true })),
  createOccurrenceSeries: vi.fn(async () => ({ success: true })),
  deleteOccurrence: vi.fn(async () => ({ success: true })),
  deleteOccurrenceSeries: vi.fn(async () => ({ success: true })),
  updateOccurrenceGrouping: vi.fn(async () => ({ success: true })),
  updateOccurrenceSeries: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/export-entities", () => ({
  exportSessionAttendanceCSV: vi.fn(),
  exportSessionsSummaryCSV: vi.fn(),
}))

vi.mock("@/app/(event)/event/[id]/sessions/export-actions", () => ({
  getSessionsAttendanceExport: vi.fn(async () => ({ success: true, data: [] })),
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

/** A past, closed session — the ordinary row in a list of held sessions. */
function makeOccurrence(overrides: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return {
    id: "occ-1",
    date: "2026-08-15T00:00:00.000Z",
    isOpen: false,
    attendeeCount: 12,
    // Fewer than `attendeeCount` on purpose: four of the twelve are volunteers,
    // who hold no registration to be counted against.
    participantCount: 8,
    isStandalone: false,
    seriesId: null,
    ...overrides,
  }
}

function renderSessions({
  eventType = "Recurring",
  occurrences = [makeOccurrence()],
  totalRegistrants = 40,
}: {
  eventType?: string
  occurrences?: OccurrenceRow[]
  totalRegistrants?: number
} = {}) {
  const recurring = eventType === "Recurring"
  return render(
    <SessionsClient
      eventId="evt-1"
      eventName="Sunday Service"
      eventType={eventType}
      occurrences={recurring ? [] : occurrences}
      seriesGroups={[]}
      ungroupedOccurrences={recurring ? occurrences : []}
      seriesOptions={[]}
      canExport={false}
      totalRegistrants={totalRegistrants}
      today={TODAY}
    />,
  )
}

/** The row's structural actions live behind one named trigger. */
function openRowMenu() {
  const trigger = screen.getByRole("button", { name: /^More actions for/ })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("sessions list", () => {
  it("renders no table — the list is plain rows", () => {
    const { container } = renderSessions()
    expect(container.querySelector("table")).toBeNull()
  })

  it("labels the check-in switch with the state it is in", () => {
    renderSessions()
    expect(screen.getByRole("switch", { name: "Check-in closed" })).toBeDefined()
  })

  it("names the state in words once the session is open, not colour alone", () => {
    renderSessions({ occurrences: [makeOccurrence({ isOpen: true })] })
    expect(screen.getByRole("switch", { name: "Check-in open" })).toBeDefined()
    expect(screen.getByText("Check-in open")).toBeDefined()
  })

  it("renders one copy of each control — no desktop/mobile twin to drift", () => {
    renderSessions()
    expect(screen.getAllByRole("switch")).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: /^More actions for/ })).toHaveLength(1)
  })

  it("toggles check-in from the labelled switch", async () => {
    renderSessions()
    fireEvent.click(screen.getByRole("switch", { name: "Check-in closed" }))
    await waitFor(() =>
      expect(setOccurrenceCheckinOpen).toHaveBeenCalledWith("occ-1", true),
    )
  })

  // The control budget is what keeps the card calm at any width: the two zones
  // hold two things each, and everything else is behind the menu.
  it("puts at most four interactive elements on the busiest card", () => {
    renderSessions({ occurrences: [makeOccurrence({ isOpen: true })] })
    const card = screen.getByRole("switch").closest("[data-slot=card]") as HTMLElement

    // date link, switch, check-in page link, menu trigger — and nothing else.
    expect(card.querySelectorAll("a, button").length).toBe(4)
  })

  it("drops to two on a past session, where the kiosk link is dead", () => {
    renderSessions()
    const card = screen.getByRole("switch").closest("[data-slot=card]") as HTMLElement

    // date link, switch, menu trigger.
    expect(card.querySelectorAll("a, button").length).toBe(3)
  })

  // The crowding fix: Manage and Delete are rare and structural, so they leave
  // the surface — but they stay named, which the icon strip never was.
  it("keeps the rare structural actions in a named menu", async () => {
    renderSessions()

    expect(screen.queryByRole("button", { name: /^Manage/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull()

    openRowMenu()
    expect(await screen.findByRole("menuitem", { name: "Manage session" })).toBeDefined()
    expect(await screen.findByRole("menuitem", { name: "Delete session" })).toBeDefined()
  })

  it("names the row in the menu trigger, so the label survives a list of them", () => {
    renderSessions()
    expect(
      screen.getByRole("button", { name: "More actions for Sat, Aug 15, 2026" }),
    ).toBeDefined()
  })

  // The dead affordance: the kiosk refuses everyone unless the session is open
  // or today is its date, so the link is only offered when it leads somewhere.
  it("withholds the check-in page link on a past, closed session", () => {
    renderSessions()
    expect(screen.queryByRole("link", { name: /Check-in page/ })).toBeNull()
  })

  it("offers the check-in page link once the session is open", () => {
    renderSessions({ occurrences: [makeOccurrence({ isOpen: true })] })
    const link = screen.getByRole("link", { name: /Check-in page/ })
    expect(link.getAttribute("href")).toBe("/events/evt-1/checkin/occ-1")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link.textContent).toContain("(opens in a new tab)")
  })

  it("offers it on today's session even while check-in is still closed", () => {
    renderSessions({
      occurrences: [makeOccurrence({ date: `${TODAY}T00:00:00.000Z`, isOpen: false })],
    })
    expect(screen.getByRole("link", { name: /Check-in page/ })).toBeDefined()
  })

  it("drops the menu entirely on a MultiDay event's days", () => {
    renderSessions({ eventType: "MultiDay" })

    expect(screen.queryByRole("button", { name: /^More actions for/ })).toBeNull()
    // The check-in control is the whole point of a day card, so it stays.
    expect(screen.getByRole("switch", { name: "Check-in closed" })).toBeDefined()
  })

  it("counts the cards in the list's own noun, and says how many are live", () => {
    renderSessions({
      eventType: "MultiDay",
      occurrences: [makeOccurrence(), makeOccurrence({ id: "occ-2", isOpen: true })],
    })
    expect(screen.getByText("2 days · 1 open")).toBeDefined()
  })

  it("leaves the open count off a list with nothing live", () => {
    renderSessions({ eventType: "MultiDay" })
    expect(screen.getByText("1 day")).toBeDefined()
    expect(screen.queryByText(/open/)).toBeNull()
  })

  it("links each session to its detail page", () => {
    renderSessions()
    const link = screen.getByRole("link", { name: /2026/ })
    expect(link.getAttribute("href")).toBe("/event/evt-1/sessions/occ-1")
  })

  it("shows attendance as a sentence rather than a bare number", () => {
    renderSessions()
    expect(screen.getByText("12 people checked in")).toBeDefined()
  })

  // Turnout divides by the series roster; the check-in count beside it includes
  // volunteers. Two populations, so the percentage never travels alone.
  it("prints the turnout rate with its denominator spelled out", () => {
    renderSessions({ occurrences: [makeOccurrence({ participantCount: 5 })], totalRegistrants: 20 })
    expect(screen.getByText("25%")).toBeDefined()
    expect(screen.getByText("5 of 20 registered")).toBeDefined()
  })

  it("omits turnout entirely when nobody registered", () => {
    renderSessions({ totalRegistrants: 0 })
    expect(screen.queryByText("—")).toBeNull()
    expect(screen.queryByText(/registered$/)).toBeNull()
  })

  // Regression: the numerator is participants, not the check-in count beside it.
  // Twelve people in the room over forty registered is 20%, not 30%, because
  // four of the twelve were serving and hold no registration.
  it("divides by registrants, never by the volunteer-inclusive count", () => {
    renderSessions({ totalRegistrants: 40 })

    expect(screen.getByText("8 of 40 registered")).toBeDefined()
    expect(screen.getByText("20%")).toBeDefined()
    expect(screen.queryByText("12 of 40 registered")).toBeNull()
  })

  // Every future-dated row on the list is this case. "0%" beside "No one checked
  // in yet" reads as a session that failed rather than one that hasn't happened.
  it("omits turnout on a session nobody has checked into yet", () => {
    renderSessions({
      occurrences: [makeOccurrence({ attendeeCount: 0, participantCount: 0 })],
      totalRegistrants: 40,
    })

    expect(screen.getByText("No one checked in yet")).toBeDefined()
    expect(screen.queryByText("0%")).toBeNull()
    expect(screen.queryByText(/registered$/)).toBeNull()
  })

  it("reads 100% when every registrant came", () => {
    renderSessions({
      occurrences: [makeOccurrence({ attendeeCount: 40, participantCount: 40 })],
      totalRegistrants: 40,
    })

    expect(screen.getByText("100%")).toBeDefined()
  })
})
