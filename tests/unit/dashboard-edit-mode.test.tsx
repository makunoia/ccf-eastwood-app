// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

import { EventDashboardClient } from "@/app/(event)/event/[id]/dashboard/dashboard-client"
import type { EventDashboardData } from "@/app/(event)/event/[id]/dashboard/shared"
import {
  defaultDashboardLayout,
  resolveDashboardLayout,
  type StoredWidget,
} from "@/lib/events/dashboard-widgets"

/**
 * Customize mode — the in-place editor.
 *
 * What can and can't be covered here: jsdom has no layout engine, so every
 * element reports a zero-sized rect. That makes pointer-drag reorder and
 * pointer-drag resize untestable — `useGridColumnWidth` can only ever return 0,
 * and a simulated dnd-kit pointer sequence would be asserting against the mock
 * rather than the feature. Those need the manual pass.
 *
 * Everything else is here: the chrome, the keyboard resize path, hide/restore,
 * the empty-slot placeholders, cancel semantics, and the payload that reaches
 * the server action.
 */

const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => "/event/evt-1/dashboard",
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

const saveEventDashboardLayout = vi.fn()
const resetEventDashboardLayout = vi.fn()
vi.mock("@/app/(dashboard)/events/dashboard-layout-actions", () => ({
  saveEventDashboardLayout: (...args: unknown[]) => saveEventDashboardLayout(...args),
  resetEventDashboardLayout: (...args: unknown[]) => resetEventDashboardLayout(...args),
}))

const ALL_MODULES: EventModuleType[] = ["Volunteers", "Breakout", "Priced"]

beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  saveEventDashboardLayout.mockReset().mockResolvedValue({ success: true, data: undefined })
  resetEventDashboardLayout.mockReset().mockResolvedValue({ success: true, data: undefined })
  refresh.mockReset()
})

function makeEvent(overrides: Partial<EventDashboardData> = {}): EventDashboardData {
  const row = {
    lifeStageId: null,
    lifeStageName: "Young Pro",
    attendees: 12,
    firstTimers: 4,
    members: 8,
    membersInGroup: 5,
    membersNotInGroup: 3,
  }

  return {
    id: "evt-1",
    name: "Midweek Service",
    description: null,
    type: "Recurring",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-01T00:00:00.000Z",
    price: null,
    registrationStart: null,
    registrationEnd: null,
    recurrenceDayOfWeek: 3,
    recurrenceFrequency: "Weekly",
    recurrenceEndDate: null,
    ministries: [],
    allMinistries: false,
    modules: ALL_MODULES,
    registrantCount: 40,
    paidCount: 12,
    attendedCount: 22,
    occurrenceCount: 6,
    totalCheckIns: 30,
    totalVolunteerCheckIns: 4,
    sessionsInPeriod: 3,
    period: "30d",
    averageAttendance: 10,
    uniqueAttendees: 12,
    turnout: { preRegistered: 40, checkedIn: 12, noShows: 28, rate: 0.3 },
    attendanceSeries: [{ date: "2026-01-07", attendees: 10, volunteers: 2, totalCheckIns: 12 }],
    registrationSeries: [{ date: "2026-01-02", total: 40 }],
    attendanceBreakdown: { rows: [row], total: { ...row, lifeStageName: "All" } },
    explainMissingLifeStage: false,
    placement: { inGroup: 5, membersUnassigned: 3, guestsUnassigned: 4 },
    unassignedCount: 7,
    pipeline: { registered: 40, attended: 12, inSmallGroup: 5, newTimothys: 1, newLeaders: 0 },
    confirmedGuestsCount: 2,
    seriesSummaries: [],
    confirmedVolunteerCount: 6,
    pendingVolunteerCount: 2,
    rejectedVolunteerCount: 1,
    brandBackground: null,
    ...overrides,
  }
}

function renderDashboard(options?: {
  type?: EventType
  modules?: EventModuleType[]
  stored?: StoredWidget[]
}) {
  const type = options?.type ?? "Recurring"
  const modules = options?.modules ?? ALL_MODULES
  const layout = options?.stored
    ? resolveDashboardLayout(options.stored, type, modules)
    : defaultDashboardLayout(type, modules)

  return {
    ...render(
      <EventDashboardClient event={makeEvent({ type, modules })} setup={null} layout={layout} />
    ),
    layout,
  }
}

function enterEditMode(options?: Parameters<typeof renderDashboard>[0]) {
  const utils = renderDashboard(options)
  fireEvent.click(screen.getByRole("button", { name: /customize/i }))
  return utils
}

/** The wrapper element for a widget, which carries its span and width. */
function widgetEl(container: HTMLElement, key: string) {
  return container.querySelector(`[data-widget="${key}"]`) as HTMLElement
}

function savedEntries() {
  expect(saveEventDashboardLayout).toHaveBeenCalledTimes(1)
  return saveEventDashboardLayout.mock.calls[0][1] as Array<{
    key: string
    visible: boolean
    width: number
  }>
}

describe("entering and leaving", () => {
  it("shows no edit chrome until Customize is clicked", () => {
    renderDashboard()

    expect(screen.queryByRole("button", { name: /move attendance by session/i })).toBeNull()
    expect(screen.queryByRole("slider")).toBeNull()
    expect(screen.queryByText(/customizing/i)).toBeNull()
  })

  it("puts a move handle, a hide button and a resize slider on every card", () => {
    enterEditMode()

    expect(screen.getByRole("button", { name: /move attendance by session/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /hide attendance by session/i })).toBeDefined()
    expect(screen.getByRole("slider", { name: /attendance by session width/i })).toBeDefined()
    expect(screen.getByText(/customizing/i)).toBeDefined()
  })

  it("lets KPI tiles be moved and hidden but never resized", () => {
    enterEditMode()

    expect(screen.getByRole("button", { name: /move turnout/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /hide turnout/i })).toBeDefined()
    expect(screen.queryByRole("slider", { name: /^turnout width/i })).toBeNull()
  })

  it("keeps rendering the real widgets, not placeholders", () => {
    const { container } = enterEditMode()

    // The live cards are still on the page with their real headings and data.
    const pipeline = widgetEl(container, "chartPipeline")
    expect(within(pipeline).getByText("Discipleship Pipeline")).toBeDefined()

    const unique = widgetEl(container, "kpiUniqueAttendees")
    expect(within(unique).getByText("Unique Attendees")).toBeDefined()
    expect(within(unique).getByText("12")).toBeDefined()
  })

  it("does not repeat each widget's title in the edit chrome", () => {
    const { container } = enterEditMode()
    const pipeline = widgetEl(container, "chartPipeline")

    // The card's own heading is the only place the name appears; the grip is
    // icon-only, with the name on its aria-label.
    expect(within(pipeline).getAllByText("Discipleship Pipeline")).toHaveLength(1)
  })

  it("makes card content inert so a chart tooltip can't fire mid-drag", () => {
    const { container } = enterEditMode()
    const card = widgetEl(container, "chartPlacement")

    expect(card.querySelector(".pointer-events-none")).not.toBeNull()
  })

  it("disables the period filter, which would reload away an unsaved layout", () => {
    enterEditMode()
    expect(screen.getByText("Last 7 days").className).toContain("pointer-events-none")
  })

  it("Cancel leaves edit mode and keeps nothing", async () => {
    const { container } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    expect(widgetEl(container, "chartPipeline")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    await waitFor(() => expect(screen.queryByText(/customizing/i)).toBeNull())
    expect(widgetEl(container, "chartPipeline")).not.toBeNull()
    expect(saveEventDashboardLayout).not.toHaveBeenCalled()
  })

  it("re-entering after a cancelled edit starts from the saved layout", () => {
    const { container } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))
    fireEvent.click(screen.getByRole("button", { name: /customize/i }))

    expect(widgetEl(container, "chartPipeline")).not.toBeNull()
  })
})

describe("resizing", () => {
  it("arrow keys move the card one column at a time", () => {
    const { container } = enterEditMode()
    const slider = screen.getByRole("slider", { name: /registration growth width/i })

    expect(slider.getAttribute("aria-valuenow")).toBe("4")

    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(
      screen.getByRole("slider", { name: /registration growth width/i }).getAttribute("aria-valuenow")
    ).toBe("5")
    expect(widgetEl(container, "chartRegistrationGrowth").className).toContain("xl:col-span-5")

    fireEvent.keyDown(screen.getByRole("slider", { name: /registration growth width/i }), {
      key: "ArrowLeft",
    })
    expect(widgetEl(container, "chartRegistrationGrowth").className).toContain("xl:col-span-4")
  })

  it("clamps at the readable floor and at full width", () => {
    enterEditMode()
    const slider = () => screen.getByRole("slider", { name: /registration growth width/i })

    for (let i = 0; i < 10; i++) fireEvent.keyDown(slider(), { key: "ArrowLeft" })
    expect(slider().getAttribute("aria-valuenow")).toBe("3")

    for (let i = 0; i < 20; i++) fireEvent.keyDown(slider(), { key: "ArrowRight" })
    expect(slider().getAttribute("aria-valuenow")).toBe("12")
  })

  it("Home and End jump to the extremes", () => {
    enterEditMode()
    const slider = () => screen.getByRole("slider", { name: /registration growth width/i })

    fireEvent.keyDown(slider(), { key: "End" })
    expect(slider().getAttribute("aria-valuenow")).toBe("12")
    fireEvent.keyDown(slider(), { key: "Home" })
    expect(slider().getAttribute("aria-valuenow")).toBe("3")
  })

  it("exposes the span for assistive tech", () => {
    enterEditMode()
    const slider = screen.getByRole("slider", { name: /attendance by session width/i })

    expect(slider.getAttribute("aria-valuemin")).toBe("3")
    expect(slider.getAttribute("aria-valuemax")).toBe("12")
    expect(slider.getAttribute("aria-valuetext")).toBe("8 of 12 columns")
  })
})

describe("hiding and restoring", () => {
  it("hiding a card moves it into the tray", () => {
    const { container } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))

    expect(widgetEl(container, "chartPipeline")).toBeNull()
    expect(screen.getByRole("button", { name: /show discipleship pipeline/i })).toBeDefined()
  })

  it("clicking a tray chip brings the widget back", () => {
    const { container } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.click(screen.getByRole("button", { name: /show discipleship pipeline/i }))

    expect(widgetEl(container, "chartPipeline")).not.toBeNull()
    expect(screen.queryByRole("button", { name: /show discipleship pipeline/i })).toBeNull()
  })

  it("lists the opt-in KPI tiles in the tray from the start", () => {
    enterEditMode()

    expect(screen.getByRole("button", { name: /show total registered/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /show paid/i })).toBeDefined()
  })

  it("restoring an opt-in KPI puts it on the page with real data", () => {
    const { container } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /show total registered/i }))

    const tile = widgetEl(container, "kpiRegistered")
    expect(tile).not.toBeNull()
    expect(within(tile).getByText("Total Registered")).toBeDefined()
    expect(within(tile).getByText("40")).toBeDefined()
  })

  it("says so when nothing is hidden", () => {
    // Every widget on, so the tray is empty.
    const stored: StoredWidget[] = [
      { key: "kpiRegistered", visible: true, order: 5, width: 4 },
      { key: "kpiPaid", visible: true, order: 6, width: 4 },
      { key: "kpiSessions", visible: true, order: 7, width: 4 },
      { key: "kpiTotalCheckIns", visible: true, order: 8, width: 4 },
    ]
    enterEditMode({ stored })

    expect(screen.getByText(/nothing hidden/i)).toBeDefined()
  })

  it("never offers a widget the event can't have", () => {
    enterEditMode({ type: "OneTime", modules: [] })

    expect(screen.queryByRole("button", { name: /show volunteer status/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /show series comparison/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /show paid/i })).toBeNull()
  })
})

describe("empty slots", () => {
  it("marks the leftover columns of a short row so the gap reads as space to fill", () => {
    const stored: StoredWidget[] = [
      { key: "chartPlacement", visible: true, order: 0, width: 4 },
      { key: "chartPipeline", visible: true, order: 1, width: 4 },
      { key: "chartAttendanceSeries", visible: false, order: 2, width: 8 },
      { key: "chartRegistrationGrowth", visible: false, order: 3, width: 4 },
      { key: "chartVolunteerStatus", visible: false, order: 4, width: 4 },
      { key: "tableLifeStage", visible: false, order: 5, width: 12 },
      { key: "chartSeriesComparison", visible: false, order: 6, width: 12 },
    ]
    const { container } = enterEditMode({ stored })

    const slots = container.querySelectorAll('[data-slot="empty-slot"]')
    expect(slots).toHaveLength(1)
    expect((slots[0] as HTMLElement).className).toContain("xl:col-span-4")
  })

  it("shows none when every row is full", () => {
    const { container } = enterEditMode()
    expect(container.querySelectorAll('[data-slot="empty-slot"]')).toHaveLength(0)
  })

  it("never shows them outside edit mode", () => {
    const { container } = renderDashboard()
    expect(container.querySelectorAll('[data-slot="empty-slot"]')).toHaveLength(0)
  })
})

describe("saving", () => {
  it("stays disabled until something actually changes", () => {
    enterEditMode()
    const save = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    expect((screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(
      false
    )
  })

  it("sends every widget, both lanes, KPIs first and in display order", async () => {
    const { layout } = enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(saveEventDashboardLayout).toHaveBeenCalled())

    const entries = savedEntries()
    expect(entries.map((e) => e.key)).toEqual([
      ...layout.kpis.map((w) => w.key),
      ...layout.cards.map((w) => w.key),
    ])
    expect(saveEventDashboardLayout.mock.calls[0][0]).toBe("evt-1")
  })

  it("carries a hidden widget and a resized one through", async () => {
    enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.keyDown(screen.getByRole("slider", { name: /registration growth width/i }), {
      key: "End",
    })
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(saveEventDashboardLayout).toHaveBeenCalled())

    const entries = savedEntries()
    expect(entries.find((e) => e.key === "chartPipeline")?.visible).toBe(false)
    expect(entries.find((e) => e.key === "chartRegistrationGrowth")?.width).toBe(12)
    expect(entries.find((e) => e.key === "chartPlacement")?.visible).toBe(true)
  })

  it("restoring a widget moves it to the end of its lane in the payload", async () => {
    enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /show total registered/i }))
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(saveEventDashboardLayout).toHaveBeenCalled())

    const kpiKeys = savedEntries()
      .filter((e) => e.key.startsWith("kpi"))
      .map((e) => e.key)
    expect(kpiKeys.at(-1)).toBe("kpiRegistered")
  })

  it("leaves edit mode and refreshes on success", async () => {
    enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByText(/customizing/i)).toBeNull()
  })

  it("stays in edit mode when the save fails, so the work isn't lost", async () => {
    saveEventDashboardLayout.mockResolvedValue({ success: false, error: "Nope." })
    enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /hide discipleship pipeline/i }))
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(saveEventDashboardLayout).toHaveBeenCalled())

    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText(/customizing/i)).toBeDefined()
  })
})

describe("resetting", () => {
  it("calls the reset action and leaves edit mode", async () => {
    enterEditMode()
    fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(resetEventDashboardLayout).toHaveBeenCalledWith("evt-1")
    expect(saveEventDashboardLayout).not.toHaveBeenCalled()
    expect(screen.queryByText(/customizing/i)).toBeNull()
  })
})
