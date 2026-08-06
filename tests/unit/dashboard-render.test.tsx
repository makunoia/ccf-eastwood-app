// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

import { EventDashboardClient } from "@/app/(event)/event/[id]/dashboard/dashboard-client"
import type { EventDashboardData } from "@/app/(event)/event/[id]/dashboard/shared"
import {
  defaultDashboardLayout,
  resolveDashboardLayout,
  type DashboardLayout,
  type StoredWidget,
} from "@/lib/events/dashboard-widgets"

/**
 * Render tests for the dashboard shell.
 *
 * The pure tests in `dashboard-widgets.test.ts` prove the layout *math*; these
 * prove the shell actually renders what that math produces — that a hidden widget
 * really disappears, that the grid spans land on the DOM, and that the default
 * layout still puts every card on the page in the order the fixed layout did.
 *
 * Recharts needs a sized container, which jsdom doesn't give it, so the chart
 * bodies come out empty. That's fine and deliberate: every assertion here is on
 * card headers, KPI labels and wrapper classes, all of which render regardless.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/event/evt-1/dashboard",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

// The customizer imports the server actions directly; nothing here submits.
vi.mock("@/app/(dashboard)/events/dashboard-layout-actions", () => ({
  saveEventDashboardLayout: vi.fn(),
  resetEventDashboardLayout: vi.fn(),
}))

const ALL_MODULES: EventModuleType[] = ["Volunteers", "Breakout", "Priced"]

beforeAll(() => {
  // Radix + recharts both probe for these in jsdom.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function makeEvent(overrides: Partial<EventDashboardData> = {}): EventDashboardData {
  const emptyRow = {
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
    attendanceBreakdown: { rows: [emptyRow], total: { ...emptyRow, lifeStageName: "All" } },
    explainMissingLifeStage: false,
    placement: { inGroup: 5, membersUnassigned: 3, guestsUnassigned: 4 },
    unassignedCount: 7,
    pipeline: {
      registered: 40,
      attended: 12,
      inSmallGroup: 5,
      newTimothys: 1,
      newLeaders: 0,
    },
    confirmedGuestsCount: 2,
    seriesSummaries: [
      {
        id: "s1",
        title: "Q1",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-03-01T00:00:00.000Z",
        sessionCount: 6,
        totalAttendance: 60,
        averageAttendance: 10,
      },
    ],
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
  layout?: DashboardLayout
}) {
  const type = options?.type ?? "Recurring"
  const modules = options?.modules ?? ALL_MODULES
  const layout =
    options?.layout ??
    (options?.stored
      ? resolveDashboardLayout(options.stored, type, modules)
      : defaultDashboardLayout(type, modules))

  const result = render(
    <EventDashboardClient
      event={makeEvent({ type, modules })}
      setup={null}
      layout={layout}
    />
  )
  return { ...result, layout }
}

/** Card titles in DOM order — the card lane's rendered sequence. */
function cardTitles(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-slot="card-title"]')).map((el) =>
    el.textContent?.trim()
  )
}

/** The grid wrapper each card sits in, so its span classes can be read. */
function cardWrappers(container: HTMLElement) {
  const grid = container.querySelector(".xl\\:grid-cols-12")
  return Array.from(grid?.querySelectorAll("[data-widget]") ?? []) as HTMLElement[]
}

/** Just the responsive span classes, ignoring presentational ones. */
function cardSpans(container: HTMLElement) {
  return cardWrappers(container).map((el) =>
    el.className
      .split(/\s+/)
      .filter((c) => c.includes("col-span"))
      .join(" ")
  )
}

describe("default layout", () => {
  it("renders every card of a Recurring dashboard in the order the fixed layout used", () => {
    const { container } = renderDashboard()

    expect(cardTitles(container)).toEqual([
      "Attendance by Session",
      "Registration Growth",
      "DGroup Placement",
      "Volunteer Status",
      "Discipleship Pipeline",
      "Attendance by Life Stage",
      "Series Comparison",
    ])
  })

  it("renders the five default KPI tiles and none of the opt-in ones", () => {
    renderDashboard()

    expect(screen.getByText("Average Attendance")).toBeDefined()
    expect(screen.getByText("Unique Attendees")).toBeDefined()
    expect(screen.getByText("Turnout")).toBeDefined()
    expect(screen.getByText("Not In DGroup Yet")).toBeDefined()
    expect(screen.getByText("Confirmed Volunteers")).toBeDefined()

    expect(screen.queryByText("Total Registered")).toBeNull()
    expect(screen.queryByText("Paid")).toBeNull()
    expect(screen.queryByText("Sessions")).toBeNull()
    expect(screen.queryByText("Total Check-ins")).toBeNull()
  })

  it("puts the documented span classes on the card wrappers", () => {
    const { container } = renderDashboard()

    expect(cardSpans(container)).toEqual([
      "md:col-span-2 xl:col-span-8", // Attendance by Session
      "md:col-span-1 xl:col-span-4", // Registration Growth
      "md:col-span-1 xl:col-span-4", // DGroup Placement
      "md:col-span-1 xl:col-span-4", // Volunteer Status
      "md:col-span-1 xl:col-span-4", // Discipleship Pipeline
      "md:col-span-2 xl:col-span-12", // Attendance by Life Stage
      "md:col-span-2 xl:col-span-12", // Series Comparison
    ])
  })

  it("gives the KPI lane one column per tile", () => {
    const { container } = renderDashboard()
    expect(container.querySelector(".xl\\:grid-cols-5")).not.toBeNull()
  })

  // jsdom has no layout, so this asserts the class chain rather than measured
  // heights — but the chain is the whole fix: a break anywhere in it and the
  // tiles fall back to their own content heights.
  it("regression: every widget carries the row height down to its own root", () => {
    const { container } = renderDashboard()

    const wrappers = Array.from(
      container.querySelectorAll("[data-widget]")
    ) as HTMLElement[]
    expect(wrappers.length).toBeGreaterThan(0)

    for (const wrapper of wrappers) {
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.className).toContain("h-full")
      expect(content.className).toContain("*:h-full")
    }

    // The KPI tile itself — the bordered box whose ragged edges started this.
    const tile = screen.getByText("Turnout").closest("[data-widget] > div > div")
    expect(tile?.className).toContain("h-full")
  })

  it("a OneTime dashboard drops the series cards and widens Registration Growth", () => {
    const { container } = renderDashboard({ type: "OneTime" })

    expect(cardTitles(container)).toEqual([
      "Registration Growth",
      "DGroup Placement",
      "Volunteer Status",
      "Discipleship Pipeline",
      "Attendance by Life Stage",
    ])
    expect(cardSpans(container)[0]).toContain("xl:col-span-12")
  })
})

describe("module gating", () => {
  it("renders no volunteer widgets when the module is off", () => {
    const { container } = renderDashboard({ modules: [] })

    expect(cardTitles(container)).not.toContain("Volunteer Status")
    expect(screen.queryByText("Confirmed Volunteers")).toBeNull()
    // Four tiles left, so the KPI lane drops to four columns.
    expect(container.querySelector(".xl\\:grid-cols-4")).not.toBeNull()
  })

  it("regression: the row closes up instead of leaving the old three-column hole", () => {
    // Placement + Pipeline used to sit in a fixed xl:grid-cols-3 row with
    // Volunteer Status between them; with the module off that left a gap.
    const { container } = renderDashboard({ type: "OneTime", modules: [] })

    const spans = cardSpans(container)
    expect(cardTitles(container)).toEqual([
      "Registration Growth",
      "DGroup Placement",
      "Discipleship Pipeline",
      "Attendance by Life Stage",
    ])
    // 12 | 4 + 8 | 12 — every row adds up, no hole.
    expect(spans[1]).toContain("xl:col-span-4")
    expect(spans[2]).toContain("xl:col-span-8")
  })
})

describe("customization", () => {
  it("hiding a card removes it from the page", () => {
    const { container } = renderDashboard({
      stored: [{ key: "chartRegistrationGrowth", visible: false, order: 1, width: 4 }],
    })

    expect(cardTitles(container)).not.toContain("Registration Growth")
    expect(cardTitles(container)).toContain("DGroup Placement")
  })

  it("hiding a KPI removes only that tile", () => {
    renderDashboard({
      stored: [{ key: "kpiTurnout", visible: false, order: 2, width: 4 }],
    })

    expect(screen.queryByText("Turnout")).toBeNull()
    expect(screen.getByText("Unique Attendees")).toBeDefined()
  })

  it("enabling an opt-in KPI renders it with real data", () => {
    renderDashboard({
      stored: [{ key: "kpiRegistered", visible: true, order: 5, width: 4 }],
    })

    expect(screen.getByText("Total Registered")).toBeDefined()
    expect(screen.getByText("40")).toBeDefined()
  })

  it("reordering the stored layout reorders the rendered cards", () => {
    const { container } = renderDashboard({
      stored: [
        { key: "tableLifeStage", visible: true, order: 0, width: 12 },
        { key: "chartAttendanceSeries", visible: true, order: 1, width: 8 },
      ],
    })

    const titles = cardTitles(container)
    expect(titles[0]).toBe("Attendance by Life Stage")
    expect(titles.indexOf("Attendance by Life Stage")).toBeLessThan(
      titles.indexOf("Attendance by Session")
    )
  })

  it("a stored width lands on the wrapper", () => {
    const { container } = renderDashboard({
      stored: [
        { key: "chartAttendanceSeries", visible: true, order: 0, width: 6 },
        { key: "chartRegistrationGrowth", visible: true, order: 1, width: 6 },
      ],
    })

    const spans = cardSpans(container)
    expect(spans[0]).toContain("xl:col-span-6")
    expect(spans[1]).toContain("xl:col-span-6")
  })

  it("explains itself when everything is hidden rather than rendering a blank page", () => {
    renderDashboard({ layout: { kpis: [], cards: [], droppedKeys: [] } })
    expect(screen.getByText(/every widget is hidden/i)).toBeDefined()
  })
})

describe("toolbar", () => {
  it("offers the Customize control", () => {
    renderDashboard()
    expect(screen.getByRole("button", { name: /customize/i })).toBeDefined()
  })

  it("keeps the check-in link for OneTime events only", () => {
    const { unmount } = renderDashboard({ type: "OneTime" })
    expect(screen.getByRole("button", { name: /check-in link/i })).toBeDefined()
    unmount()

    renderDashboard({ type: "Recurring" })
    expect(screen.queryByRole("button", { name: /check-in link/i })).toBeNull()
  })

  it("still renders the period filter links, widest window first", () => {
    const { container } = renderDashboard()
    const toolbar = container.querySelector("div.flex.flex-wrap.items-center")
    expect(within(toolbar as HTMLElement).getByText("Last 7 days")).toBeDefined()
    expect(within(toolbar as HTMLElement).getByText("All time")).toBeDefined()

    const labels = Array.from(
      (toolbar as HTMLElement).querySelectorAll("a[href*='period=']")
    ).map((el) => el.textContent?.trim())
    expect(labels).toEqual(["All time", "Last 7 days", "Last 30 days", "Last 90 days"])
  })
})
