import { describe, expect, it } from "vitest"
import type { EventModuleType } from "@/app/generated/prisma/client"
import {
  DASHBOARD_WIDGETS,
  GRID_COLUMNS,
  MIN_CARD_WIDTH,
  WIDGET_WIDTHS,
  WIDTH_CLASS,
  WIDTH_LABELS,
  defaultDashboardLayout,
  isWidgetAvailable,
  kpiColumnCount,
  kpiGridClass,
  shouldPackRows,
  snapWidth,
  packCardRow,
  resolveDashboardLayout,
  visibleLayout,
  visibleWidgetKeys,
  type DashboardWidgetKey,
  type ResolvedWidget,
  type StoredWidget,
  type WidgetWidth,
} from "@/lib/events/dashboard-widgets"

const ALL: EventModuleType[] = ["Volunteers", "Breakout", "Priced", "Baptism"]

function keysOf(widgets: ResolvedWidget[]) {
  return widgets.map((w) => w.key)
}

function card(key: DashboardWidgetKey, width: WidgetWidth): ResolvedWidget {
  return { key, visible: true, width }
}

/** Every row a packed list produces must add up to exactly the grid width. */
function rowTotals(cards: ResolvedWidget[]): number[] {
  const totals: number[] = []
  let row = 0
  for (const c of cards) {
    if (row + c.width > GRID_COLUMNS) {
      totals.push(row)
      row = 0
    }
    row += c.width
  }
  if (row > 0) totals.push(row)
  return totals
}

describe("defaultDashboardLayout", () => {
  // Turnout is absent here on purpose: a Recurring event has no event-wide
  // roster to divide by — see the `eventTypes` note on `kpiTurnout`. It lives on
  // the session detail page instead.
  it("reproduces the pre-customization layout for a Recurring event", () => {
    const layout = visibleLayout(defaultDashboardLayout("Recurring", ALL))

    expect(keysOf(layout.kpis)).toEqual([
      "kpiAttendance",
      "kpiUniqueAttendees",
      "kpiUnassigned",
      "kpiVolunteers",
    ])
    expect(keysOf(layout.cards)).toEqual([
      "chartAttendanceSeries",
      "chartRegistrationGrowth",
      "chartPlacement",
      "chartVolunteerStatus",
      "chartPipeline",
      "tableLifeStage",
      "chartSeriesComparison",
    ])
    // 8 + 4, then 4 + 4 + 4, then two full-width rows — the shipped grid.
    expect(layout.cards.map((c) => c.width)).toEqual([8, 4, 4, 4, 4, 12, 12])
  })

  it("drops the series-only widgets on a OneTime event", () => {
    const layout = visibleLayout(defaultDashboardLayout("OneTime", ALL))

    expect(keysOf(layout.cards)).not.toContain("chartAttendanceSeries")
    expect(keysOf(layout.cards)).not.toContain("chartSeriesComparison")
    // With no attendance chart beside it, Registration Growth takes the row.
    expect(layout.cards[0].key).toBe("chartRegistrationGrowth")
    expect(layout.cards[0].width).toBe(12)
  })

  it("keeps Attendance by Session but drops Series Comparison on MultiDay", () => {
    const keys = keysOf(visibleLayout(defaultDashboardLayout("MultiDay", ALL)).cards)
    expect(keys).toContain("chartAttendanceSeries")
    expect(keys).not.toContain("chartSeriesComparison")
  })

  it("leaves the four new KPI tiles off by default", () => {
    const layout = defaultDashboardLayout("Recurring", ALL)
    const off = layout.kpis.filter((w) => !w.visible).map((w) => w.key)
    expect(off).toEqual(["kpiRegistered", "kpiPaid", "kpiSessions", "kpiTotalCheckIns"])
  })
})

describe("module gating", () => {
  it("hides both volunteer widgets when the Volunteers module is off", () => {
    const layout = defaultDashboardLayout("Recurring", [])
    expect(keysOf(layout.kpis)).not.toContain("kpiVolunteers")
    expect(keysOf(layout.cards)).not.toContain("chartVolunteerStatus")
  })

  it("hides the Paid tile when the Priced module is off", () => {
    expect(keysOf(defaultDashboardLayout("OneTime", ["Volunteers"]).kpis)).not.toContain("kpiPaid")
    expect(keysOf(defaultDashboardLayout("OneTime", ["Priced"]).kpis)).toContain("kpiPaid")
  })

  it("isWidgetAvailable checks event type and module together", () => {
    expect(isWidgetAvailable(DASHBOARD_WIDGETS.kpiSessions, "OneTime", ALL)).toBe(false)
    expect(isWidgetAvailable(DASHBOARD_WIDGETS.kpiSessions, "MultiDay", ALL)).toBe(true)
    expect(isWidgetAvailable(DASHBOARD_WIDGETS.kpiVolunteers, "OneTime", [])).toBe(false)
    expect(isWidgetAvailable(DASHBOARD_WIDGETS.kpiVolunteers, "OneTime", ["Volunteers"])).toBe(true)
  })

  it("a stored row cannot resurrect a widget whose module was turned off", () => {
    const stored: StoredWidget[] = [
      { key: "chartVolunteerStatus", visible: true, order: 0, width: 12 },
    ]
    const layout = resolveDashboardLayout(stored, "Recurring", [])
    expect(keysOf(layout.cards)).not.toContain("chartVolunteerStatus")
  })
})

describe("resolveDashboardLayout", () => {
  it("applies stored visibility and width over the defaults", () => {
    const stored: StoredWidget[] = [
      { key: "chartRegistrationGrowth", visible: false, order: 0, width: 4 },
      { key: "chartPlacement", visible: true, order: 1, width: 6 },
    ]
    const layout = resolveDashboardLayout(stored, "Recurring", ALL)

    const growth = layout.cards.find((c) => c.key === "chartRegistrationGrowth")
    expect(growth?.visible).toBe(false)
    expect(layout.cards.find((c) => c.key === "chartPlacement")?.width).toBe(6)
  })

  it("honours stored order ahead of the default order", () => {
    const stored: StoredWidget[] = [
      { key: "kpiTurnout", visible: true, order: 0, width: 4 },
      { key: "kpiAttendance", visible: true, order: 1, width: 4 },
    ]
    const kpis = keysOf(resolveDashboardLayout(stored, "OneTime", ALL).kpis)
    expect(kpis.indexOf("kpiTurnout")).toBeLessThan(kpis.indexOf("kpiAttendance"))
  })

  it("keeps a widget with no stored row at its default position and visibility", () => {
    // Only one row stored — everything else falls back.
    const stored: StoredWidget[] = [{ key: "kpiTurnout", visible: false, order: 99, width: 4 }]
    // MultiDay, because Turnout is not offered on a Recurring event.
    const layout = resolveDashboardLayout(stored, "MultiDay", ALL)

    expect(layout.kpis.find((w) => w.key === "kpiTurnout")?.visible).toBe(false)
    expect(layout.kpis.find((w) => w.key === "kpiAttendance")?.visible).toBe(true)
    // Pushed to the back by its stored order, without disturbing the rest.
    expect(layout.kpis.at(-1)?.key).toBe("kpiTurnout")
  })

  it("ignores an unknown stored key instead of throwing", () => {
    const stored: StoredWidget[] = [
      { key: "widgetThatNoLongerExists", visible: true, order: 0, width: 12 },
    ]
    expect(() => resolveDashboardLayout(stored, "OneTime", ALL)).not.toThrow()
    expect(resolveDashboardLayout(stored, "OneTime", ALL)).toEqual(
      defaultDashboardLayout("OneTime", ALL)
    )
  })

  it("falls back to the default width when a stored width is not allowed", () => {
    const stored: StoredWidget[] = [
      // Narrower than the readable floor, and wider than the grid.
      { key: "chartPlacement", visible: true, order: 2, width: 2 },
      { key: "chartPipeline", visible: true, order: 4, width: 13 },
      // KPI tiles take no width at all, so any stored value is ignored.
      { key: "kpiTurnout", visible: true, order: 2, width: 8 },
    ]
    const layout = resolveDashboardLayout(stored, "MultiDay", ALL)
    expect(layout.cards.find((c) => c.key === "chartPlacement")?.width).toBe(4)
    expect(layout.cards.find((c) => c.key === "chartPipeline")?.width).toBe(4)
    expect(layout.kpis.find((w) => w.key === "kpiTurnout")?.width).toBe(4)
  })

  it("sorts deterministically when a stored order ties with a default one", () => {
    const stored: StoredWidget[] = [{ key: "chartPipeline", visible: true, order: 2, width: 4 }]
    const first = keysOf(resolveDashboardLayout(stored, "Recurring", ALL).cards)
    const second = keysOf(
      resolveDashboardLayout([...stored].reverse(), "Recurring", ALL).cards
    )
    expect(first).toEqual(second)
    // Ties break on default order, so Placement (default 2) precedes Pipeline.
    expect(first.indexOf("chartPlacement")).toBeLessThan(first.indexOf("chartPipeline"))
  })
})

describe("visibleWidgetKeys", () => {
  it("collects visible keys across both lanes and omits hidden ones", () => {
    const stored: StoredWidget[] = [
      { key: "chartSeriesComparison", visible: false, order: 6, width: 12 },
    ]
    const keys = visibleWidgetKeys(resolveDashboardLayout(stored, "Recurring", ALL))
    expect(keys.has("kpiAttendance")).toBe(true)
    expect(keys.has("tableLifeStage")).toBe(true)
    expect(keys.has("chartSeriesComparison")).toBe(false)
    // Off by default, so absent without anyone hiding it.
    expect(keys.has("kpiPaid")).toBe(false)
  })
})

describe("the width scale", () => {
  it("allows every column from the readable floor to full width", () => {
    expect([...WIDGET_WIDTHS]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(MIN_CARD_WIDTH).toBe(3)
  })

  it("has a class and a label for every allowed width", () => {
    for (const width of WIDGET_WIDTHS) {
      expect(WIDTH_CLASS[width], `class for ${width}`).toBeTruthy()
      expect(WIDTH_LABELS[width], `label for ${width}`).toBeTruthy()
      // Tailwind only sees literal class names — an interpolated one silently
      // produces no CSS at all.
      expect(WIDTH_CLASS[width]).toContain(`xl:col-span-${width}`)
    }
  })

  it("offers the full range to cards and none to KPI tiles", () => {
    expect(DASHBOARD_WIDGETS.chartPlacement.widths).toEqual([...WIDGET_WIDTHS])
    expect(DASHBOARD_WIDGETS.kpiTurnout.widths).toEqual([])
  })
})

describe("snapWidth", () => {
  const column = 100 // one column plus its gutter

  it("returns the starting width when the pointer hasn't moved", () => {
    expect(snapWidth(6, 0, column)).toBe(6)
  })

  it("snaps to the nearest column boundary", () => {
    expect(snapWidth(6, 100, column)).toBe(7)
    expect(snapWidth(6, 260, column)).toBe(9)
    expect(snapWidth(6, -100, column)).toBe(5)
  })

  it("rounds at the halfway point rather than truncating", () => {
    expect(snapWidth(6, 49, column)).toBe(6)
    expect(snapWidth(6, 51, column)).toBe(7)
  })

  it("clamps at both ends however far the drag goes", () => {
    expect(snapWidth(6, -9999, column)).toBe(MIN_CARD_WIDTH)
    expect(snapWidth(6, 9999, column)).toBe(12)
  })

  it("holds the starting width when the grid hasn't been measured yet", () => {
    // jsdom and the first paint both report a zero-width grid; dividing by it
    // would send the card to a clamp bound on the very first pointer move.
    expect(snapWidth(8, 250, 0)).toBe(8)
    expect(snapWidth(8, 250, Number.NaN)).toBe(8)
  })

  it("only ever produces a width the registry allows", () => {
    for (let start = MIN_CARD_WIDTH; start <= 12; start++) {
      for (let delta = -800; delta <= 800; delta += 37) {
        expect(WIDGET_WIDTHS).toContain(snapWidth(start, delta, column))
      }
    }
  })
})

describe("shouldPackRows", () => {
  it("is false when the event can have every card — the admin owns the gaps", () => {
    const layout = resolveDashboardLayout([], "Recurring", ALL)
    expect(layout.droppedKeys.filter((k) => DASHBOARD_WIDGETS[k].lane === "card")).toEqual([])
    expect(shouldPackRows(layout)).toBe(false)
  })

  // A KPI leaving takes no space out of the card grid — that lane sizes itself
  // from its own tile count — so the card rows keep the shape the admin gave
  // them. Gating one tile on event type must not silently re-pack the page.
  it("is false when only a KPI was dropped", () => {
    const layout = resolveDashboardLayout([], "Recurring", ALL)
    expect(layout.droppedKeys).toEqual(["kpiTurnout"])
    expect(shouldPackRows(layout)).toBe(false)
  })

  it("is true when a module being off removed a widget", () => {
    const layout = resolveDashboardLayout([], "Recurring", [])
    expect(layout.droppedKeys).toContain("chartVolunteerStatus")
    expect(layout.droppedKeys).toContain("kpiVolunteers")
    expect(shouldPackRows(layout)).toBe(true)
  })

  it("is true when the event type rules a widget out", () => {
    const layout = resolveDashboardLayout([], "OneTime", ALL)
    expect(layout.droppedKeys).toContain("chartSeriesComparison")
    expect(shouldPackRows(layout)).toBe(true)
  })

  it("behavior change: a deliberate gap survives when nothing was dropped", () => {
    // Two third-width cards leave four columns empty. That is now a layout, not
    // a bug — the admin dragged them there.
    const stored: StoredWidget[] = [
      { key: "chartPlacement", visible: true, order: 0, width: 4 },
      { key: "chartPipeline", visible: true, order: 1, width: 4 },
      { key: "chartAttendanceSeries", visible: false, order: 2, width: 8 },
      { key: "chartRegistrationGrowth", visible: false, order: 3, width: 4 },
      { key: "chartVolunteerStatus", visible: false, order: 4, width: 4 },
      { key: "tableLifeStage", visible: false, order: 5, width: 12 },
      { key: "chartSeriesComparison", visible: false, order: 6, width: 12 },
    ]
    const layout = resolveDashboardLayout(stored, "Recurring", ALL)
    const cards = visibleLayout(layout).cards

    expect(shouldPackRows(layout)).toBe(false)
    expect(cards.map((c) => c.width)).toEqual([4, 4])
    expect(rowTotals(cards)).toEqual([8]) // the gap is kept
  })

  it("regression: the same two cards still close their row when a drop caused the hole", () => {
    const stored: StoredWidget[] = [
      { key: "chartPlacement", visible: true, order: 0, width: 4 },
      { key: "chartVolunteerStatus", visible: true, order: 1, width: 4 },
      { key: "chartPipeline", visible: true, order: 2, width: 4 },
      { key: "chartAttendanceSeries", visible: false, order: 3, width: 8 },
      { key: "chartRegistrationGrowth", visible: false, order: 4, width: 4 },
      { key: "tableLifeStage", visible: false, order: 5, width: 12 },
      { key: "chartSeriesComparison", visible: false, order: 6, width: 12 },
    ]
    // Volunteers off — the middle card of a deliberately full row disappears.
    const layout = resolveDashboardLayout(stored, "Recurring", [])
    const cards = visibleLayout(layout).cards

    expect(shouldPackRows(layout)).toBe(true)
    expect(packCardRow(cards).map((c) => c.width)).toEqual([4, 8])
    expect(rowTotals(packCardRow(cards))).toEqual([GRID_COLUMNS])
  })
})

describe("packCardRow", () => {
  it("never produces a width outside the allowed scale", () => {
    // Row totals are sums of legal spans, so a closed row's last card lands on
    // 12 - rest, where rest is at most 12 - MIN_CARD_WIDTH.
    for (const widths of [
      [3, 3, 3],
      [5, 5],
      [7],
      [3, 4],
      [11],
      [9, 3],
      [4, 4, 3],
    ] as const) {
      const packed = packCardRow(widths.map((w) => card("chartPlacement", w)))
      for (const c of packed) {
        expect(WIDGET_WIDTHS, `from ${widths.join("+")}`).toContain(c.width)
      }
      expect(rowTotals(packed)).toEqual([GRID_COLUMNS])
    }
  })


  it("leaves a layout that already fills every row untouched", () => {
    const cards = [
      card("chartAttendanceSeries", 8),
      card("chartRegistrationGrowth", 4),
      card("chartPlacement", 4),
      card("chartVolunteerStatus", 4),
      card("chartPipeline", 4),
    ]
    expect(packCardRow(cards).map((c) => c.width)).toEqual([8, 4, 4, 4, 4])
  })

  it("regression: closes the gap the fixed three-column breakdown row left behind", () => {
    // The shipped dashboard rendered Placement / Volunteer Status / Pipeline in
    // an xl:grid-cols-3 row. Volunteer Status is gated on the Volunteers module,
    // so with the module off the row showed two cards and a hole.
    const cards = [card("chartPlacement", 4), card("chartPipeline", 4)]
    const packed = packCardRow(cards)

    expect(packed.map((c) => c.width)).toEqual([4, 8])
    expect(rowTotals(packed)).toEqual([GRID_COLUMNS])
  })

  it("fills the trailing row when a single card is left over", () => {
    const packed = packCardRow([
      card("chartPlacement", 4),
      card("chartPipeline", 4),
      card("chartRegistrationGrowth", 4),
      card("tableLifeStage", 4),
    ])
    expect(packed.map((c) => c.width)).toEqual([4, 4, 4, 12])
  })

  it("never leaves a partial row, for any default layout", () => {
    const cases: Array<[Parameters<typeof defaultDashboardLayout>[0], EventModuleType[]]> = [
      ["OneTime", ALL],
      ["OneTime", []],
      ["MultiDay", ALL],
      ["MultiDay", []],
      ["Recurring", ALL],
      ["Recurring", []],
    ]
    for (const [type, modules] of cases) {
      const cards = packCardRow(visibleLayout(defaultDashboardLayout(type, modules)).cards)
      for (const total of rowTotals(cards)) {
        expect(total, `${type} / ${modules.join(",") || "no modules"}`).toBe(GRID_COLUMNS)
      }
    }
  })

  it("only widens cards — a deliberately narrow card mid-row keeps its width", () => {
    const packed = packCardRow([
      card("chartPlacement", 4),
      card("chartPipeline", 4),
      card("chartRegistrationGrowth", 4),
    ])
    expect(packed.map((c) => c.width)).toEqual([4, 4, 4])
  })

  it("handles an empty list", () => {
    expect(packCardRow([])).toEqual([])
  })
})

describe("grid classes", () => {
  /**
   * Pins the classes the shell emits against the ones the pre-refactor dashboard
   * hard-coded, so the layout rewrite stays visually identical until an admin
   * actually customizes something.
   */
  it("a default Recurring dashboard emits the classes the fixed layout did", () => {
    const layout = visibleLayout(defaultDashboardLayout("Recurring", ALL))

    expect(kpiGridClass(layout.kpis.length)).toBe("xl:grid-cols-4")
    expect(packCardRow(layout.cards).map((c) => WIDTH_CLASS[c.width])).toEqual([
      "md:col-span-2 xl:col-span-8", // Attendance by Session
      "md:col-span-1 xl:col-span-4", // Registration Growth
      "md:col-span-1 xl:col-span-4", // DGroup Placement
      "md:col-span-1 xl:col-span-4", // Volunteer Status
      "md:col-span-1 xl:col-span-4", // Discipleship Pipeline
      "md:col-span-2 xl:col-span-12", // Attendance by Life Stage
      "md:col-span-2 xl:col-span-12", // Series Comparison
    ])
  })

  it("drops a KPI column without the Volunteers module, as before", () => {
    const layout = visibleLayout(defaultDashboardLayout("Recurring", []))
    expect(kpiGridClass(layout.kpis.length)).toBe("xl:grid-cols-3")
  })

  it("a default OneTime dashboard gives Registration Growth the full row", () => {
    const cards = packCardRow(visibleLayout(defaultDashboardLayout("OneTime", ALL)).cards)
    expect(cards.map((c) => WIDTH_CLASS[c.width])).toEqual([
      "md:col-span-2 xl:col-span-12", // Registration Growth
      "md:col-span-1 xl:col-span-4", // DGroup Placement
      "md:col-span-1 xl:col-span-4", // Volunteer Status
      "md:col-span-1 xl:col-span-4", // Discipleship Pipeline
      "md:col-span-2 xl:col-span-12", // Attendance by Life Stage
    ])
  })

  it("has a class for every width and every reachable column count", () => {
    for (const width of [4, 6, 8, 12] as const) {
      expect(WIDTH_CLASS[width]).toBeTruthy()
    }
    const maxKpis = Object.values(DASHBOARD_WIDGETS).filter((m) => m.lane === "kpi").length
    for (let n = 0; n <= maxKpis; n++) {
      expect(kpiGridClass(n), `${n} tiles`).toBeTruthy()
    }
  })
})

describe("kpiColumnCount", () => {
  it("gives each tile its own column up to five", () => {
    expect(kpiColumnCount(1)).toBe(1)
    expect(kpiColumnCount(4)).toBe(4)
    expect(kpiColumnCount(5)).toBe(5)
  })

  it("wraps into balanced rows beyond five", () => {
    expect(kpiColumnCount(6)).toBe(3)
    expect(kpiColumnCount(8)).toBe(4)
    expect(kpiColumnCount(9)).toBe(5)
  })

  it("never returns zero columns", () => {
    expect(kpiColumnCount(0)).toBe(1)
  })

  it("stays within the five static grid classes for every possible tile count", () => {
    const maxKpis = Object.values(DASHBOARD_WIDGETS).filter((m) => m.lane === "kpi").length
    for (let n = 0; n <= maxKpis; n++) {
      expect(kpiColumnCount(n)).toBeGreaterThanOrEqual(1)
      expect(kpiColumnCount(n)).toBeLessThanOrEqual(5)
    }
  })
})
