import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

/**
 * Per-event dashboard layout — which widgets show, in what order, at what width.
 *
 * Pure and DB-free on purpose, the same split as `lib/forms/context-config.ts`:
 * the customizer (a client component), the resolver that renders the page, and
 * the server action that validates a save all import from here, so the row an
 * admin drags and the row the server accepts can never disagree. Prisma lives in
 * `dashboard-widgets-server.ts`.
 *
 * No rows stored for an event means "never customized" — every widget falls back
 * to the defaults below, which reproduce the layout the dashboard shipped with.
 */

// ─── Keys ────────────────────────────────────────────────────────────────────

export const DASHBOARD_WIDGET_KEYS = [
  // KPI lane
  "kpiAttendance",
  "kpiUniqueAttendees",
  "kpiTurnout",
  "kpiUnassigned",
  "kpiVolunteers",
  "kpiRegistered",
  "kpiPaid",
  "kpiSessions",
  "kpiTotalCheckIns",
  // Card lane
  "chartAttendanceSeries",
  "chartRegistrationGrowth",
  "chartPlacement",
  "chartVolunteerStatus",
  "chartPipeline",
  "tableLifeStage",
  "chartSeriesComparison",
] as const

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number]

export type WidgetLane = "kpi" | "card"

/**
 * Column spans in the 12-column card grid.
 *
 * Any column boundary is allowed so the resize handle feels like a real resize
 * rather than four presets. Three is the floor: a chart narrower than a quarter
 * of the page stops being readable. KPI tiles take no width at all — that lane
 * sizes itself from the tile count.
 */
export const MIN_CARD_WIDTH = 3
export const WIDGET_WIDTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
export type WidgetWidth = (typeof WIDGET_WIDTHS)[number]

/** Badge copy. The four spans that land on a clean fraction say so. */
export const WIDTH_LABELS: Record<WidgetWidth, string> = {
  3: "¼",
  4: "⅓",
  5: "5/12",
  6: "½",
  7: "7/12",
  8: "⅔",
  9: "¾",
  10: "10/12",
  11: "11/12",
  12: "Full",
}

const SERIES_TYPES = ["MultiDay", "Recurring"] as const satisfies readonly EventType[]

// ─── Registry ────────────────────────────────────────────────────────────────

export type DashboardWidgetMeta = {
  key: DashboardWidgetKey
  lane: WidgetLane
  label: string
  /** Shown under the label in the customizer. */
  description: string
  defaultVisible: boolean
  /** Position within its lane when nothing is stored. */
  defaultOrder: number
  /**
   * Width when nothing is stored. A function when the sensible default depends
   * on what else is on the page for this event type.
   */
  defaultWidth: WidgetWidth | ((eventType: EventType) => WidgetWidth)
  /** Widths the admin may choose. Empty for the KPI lane. */
  widths: readonly WidgetWidth[]
  /** Hidden entirely — from the dashboard and the customizer — without this module. */
  requiresModule?: EventModuleType
  /** Event types this widget applies to. Undefined means all of them. */
  eventTypes?: readonly EventType[]
}

const CARD_WIDTHS = WIDGET_WIDTHS

/**
 * Order here is the default order on the page. The visible entries reproduce the
 * pre-customization dashboard exactly; the four `defaultVisible: false` KPIs are
 * figures the dashboard query already computed but never rendered.
 */
export const DASHBOARD_WIDGETS: Record<DashboardWidgetKey, DashboardWidgetMeta> = {
  // ── KPI lane ──
  kpiAttendance: {
    key: "kpiAttendance",
    lane: "kpi",
    label: "Attendance",
    description:
      "Average check-ins per session, or total attended for a one-time event.",
    defaultVisible: true,
    defaultOrder: 0,
    defaultWidth: 4,
    widths: [],
  },
  kpiUniqueAttendees: {
    key: "kpiUniqueAttendees",
    lane: "kpi",
    label: "Unique Attendees",
    description: "Distinct people who checked in during the selected period.",
    defaultVisible: true,
    defaultOrder: 1,
    defaultWidth: 4,
    widths: [],
  },
  kpiTurnout: {
    key: "kpiTurnout",
    lane: "kpi",
    label: "Turnout",
    description: "Share of registered people who actually checked in.",
    defaultVisible: true,
    defaultOrder: 2,
    defaultWidth: 4,
    widths: [],
    // Not on a Recurring event. Turnout divides check-ins by everyone holding a
    // registration, which on a weekly service is a roster that only grows — so
    // the event-wide figure decays toward zero no matter how well any given
    // Sunday went, and moves retroactively as new people register. There is no
    // event-wide "expected" for a standing series to divide by. The question is
    // still worth asking of a *single sitting*, so the figure lives on the
    // session detail page, where the denominator is stated beside it.
    eventTypes: ["OneTime", "MultiDay"],
  },
  kpiUnassigned: {
    key: "kpiUnassigned",
    lane: "kpi",
    label: "Not In DGroup Yet",
    description: "Members and guests from this event still without a DGroup.",
    defaultVisible: true,
    defaultOrder: 3,
    defaultWidth: 4,
    widths: [],
  },
  kpiVolunteers: {
    key: "kpiVolunteers",
    lane: "kpi",
    label: "Confirmed Volunteers",
    description: "Volunteers who have been confirmed for this event.",
    defaultVisible: true,
    defaultOrder: 4,
    defaultWidth: 4,
    widths: [],
    requiresModule: "Volunteers",
  },
  kpiRegistered: {
    key: "kpiRegistered",
    lane: "kpi",
    label: "Total Registered",
    description: "Everyone on the roster, regardless of whether they attended.",
    defaultVisible: false,
    defaultOrder: 5,
    defaultWidth: 4,
    widths: [],
  },
  kpiPaid: {
    key: "kpiPaid",
    lane: "kpi",
    label: "Paid",
    description: "Registrants marked as paid, with a payment reference on file.",
    defaultVisible: false,
    defaultOrder: 6,
    defaultWidth: 4,
    widths: [],
    requiresModule: "Priced",
  },
  kpiSessions: {
    key: "kpiSessions",
    lane: "kpi",
    label: "Sessions",
    description: "Total sessions created for this event, across all time.",
    defaultVisible: false,
    defaultOrder: 7,
    defaultWidth: 4,
    widths: [],
    eventTypes: SERIES_TYPES,
  },
  kpiTotalCheckIns: {
    key: "kpiTotalCheckIns",
    lane: "kpi",
    label: "Total Check-ins",
    description:
      "Every participant check-in in the period, counting someone once per session they attended.",
    defaultVisible: false,
    defaultOrder: 8,
    defaultWidth: 4,
    widths: [],
    // A one-time event has one check-in per person, so this would just restate
    // the Attendance tile beside it.
    eventTypes: SERIES_TYPES,
  },

  // ── Card lane ──
  chartAttendanceSeries: {
    key: "chartAttendanceSeries",
    lane: "card",
    label: "Attendance by Session",
    description: "Participant and volunteer check-ins plotted per session.",
    defaultVisible: true,
    defaultOrder: 0,
    defaultWidth: 8,
    widths: CARD_WIDTHS,
    eventTypes: SERIES_TYPES,
  },
  chartRegistrationGrowth: {
    key: "chartRegistrationGrowth",
    lane: "card",
    label: "Registration Growth",
    description: "Cumulative registrations over the selected period.",
    defaultVisible: true,
    defaultOrder: 1,
    // Sits beside Attendance by Session on a series event and takes the row on
    // its own otherwise — which is what the hard-coded layout did before.
    defaultWidth: (eventType) => (eventType === "OneTime" ? 12 : 4),
    widths: CARD_WIDTHS,
  },
  chartPlacement: {
    key: "chartPlacement",
    lane: "card",
    label: "DGroup Placement",
    description: "Participants assigned to a DGroup versus still unassigned.",
    defaultVisible: true,
    defaultOrder: 2,
    defaultWidth: 4,
    widths: CARD_WIDTHS,
  },
  chartVolunteerStatus: {
    key: "chartVolunteerStatus",
    lane: "card",
    label: "Volunteer Status",
    description: "Confirmed, pending and rejected volunteers.",
    defaultVisible: true,
    defaultOrder: 3,
    defaultWidth: 4,
    widths: CARD_WIDTHS,
    requiresModule: "Volunteers",
  },
  chartPipeline: {
    key: "chartPipeline",
    lane: "card",
    label: "Discipleship Pipeline",
    description: "Registered → attended → in a DGroup → new Timothys and Leaders.",
    defaultVisible: true,
    defaultOrder: 4,
    defaultWidth: 4,
    widths: CARD_WIDTHS,
  },
  tableLifeStage: {
    key: "tableLifeStage",
    lane: "card",
    label: "Attendance by Life Stage",
    description: "First-timers versus members per life stage, as a chart and a table.",
    defaultVisible: true,
    defaultOrder: 5,
    defaultWidth: 12,
    widths: CARD_WIDTHS,
  },
  chartSeriesComparison: {
    key: "chartSeriesComparison",
    lane: "card",
    label: "Series Comparison",
    description: "Average attendance across each recurring session group.",
    defaultVisible: true,
    defaultOrder: 6,
    defaultWidth: 12,
    widths: CARD_WIDTHS,
    eventTypes: ["Recurring"],
  },
}

export const ALL_DASHBOARD_WIDGETS: readonly DashboardWidgetMeta[] = DASHBOARD_WIDGET_KEYS.map(
  (key) => DASHBOARD_WIDGETS[key]
)

export function isDashboardWidgetKey(value: string): value is DashboardWidgetKey {
  return value in DASHBOARD_WIDGETS
}

// ─── Availability ────────────────────────────────────────────────────────────

/**
 * Whether a widget applies to this event at all.
 *
 * An unavailable widget is dropped on read *and* rejected on write, so a stored
 * row left behind by a module that was later turned off can never resurrect the
 * widget — it simply stops resolving.
 */
export function isWidgetAvailable(
  meta: DashboardWidgetMeta,
  eventType: EventType,
  modules: readonly EventModuleType[]
): boolean {
  if (meta.eventTypes && !meta.eventTypes.includes(eventType)) return false
  if (meta.requiresModule && !modules.includes(meta.requiresModule)) return false
  return true
}

export function availableWidgets(
  eventType: EventType,
  modules: readonly EventModuleType[]
): DashboardWidgetMeta[] {
  return ALL_DASHBOARD_WIDGETS.filter((meta) => isWidgetAvailable(meta, eventType, modules))
}

export function resolveDefaultWidth(
  meta: DashboardWidgetMeta,
  eventType: EventType
): WidgetWidth {
  return typeof meta.defaultWidth === "function" ? meta.defaultWidth(eventType) : meta.defaultWidth
}

/** Whether a width is one the admin is allowed to pick for this widget. */
export function isWidthAllowed(meta: DashboardWidgetMeta, width: number): width is WidgetWidth {
  return (meta.widths as readonly number[]).includes(width)
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/** A stored row, narrowed to what resolution actually needs. */
export type StoredWidget = {
  key: string
  visible: boolean
  order: number
  width: number
}

/**
 * Deliberately just the stored facts, with no `meta` attached: this crosses the
 * server/client boundary as a prop, and `DashboardWidgetMeta.defaultWidth` can be
 * a function, which doesn't serialize. Anything needing the metadata looks it up
 * in `DASHBOARD_WIDGETS` by key on whichever side it's running.
 */
export type ResolvedWidget = {
  key: DashboardWidgetKey
  visible: boolean
  width: WidgetWidth
}

export type DashboardLayout = {
  kpis: ResolvedWidget[]
  cards: ResolvedWidget[]
  /**
   * Widgets this event can't have — ruled out by its type or by a module being
   * off. Drives whether the grid closes its own rows: see `shouldPackRows`.
   */
  droppedKeys: DashboardWidgetKey[]
}

/**
 * Merge stored rows over the defaults.
 *
 * Unavailable widgets are dropped, unknown keys are ignored rather than thrown on
 * (a widget removed from the registry leaves rows behind), and a widget with no
 * stored row keeps its default — so a widget added in a later release shows up on
 * every already-customized event instead of silently vanishing.
 *
 * Both lanes come back in display order, hidden widgets included, because the
 * customizer needs to list those too. Callers that render should filter on
 * `visible`; `visibleLayout` does it for them.
 */
export function resolveDashboardLayout(
  stored: readonly StoredWidget[],
  eventType: EventType,
  modules: readonly EventModuleType[]
): DashboardLayout {
  const byKey = new Map<DashboardWidgetKey, StoredWidget>()
  for (const row of stored) {
    if (isDashboardWidgetKey(row.key)) byKey.set(row.key, row)
  }

  const available = availableWidgets(eventType, modules)
  const availableKeys = new Set(available.map((meta) => meta.key))
  const droppedKeys = DASHBOARD_WIDGET_KEYS.filter((key) => !availableKeys.has(key))

  const resolved = available.map((meta) => {
    const row = byKey.get(meta.key)
    const storedWidth = row && isWidthAllowed(meta, row.width) ? row.width : null
    return {
      widget: {
        key: meta.key,
        visible: row ? row.visible : meta.defaultVisible,
        width: storedWidth ?? resolveDefaultWidth(meta, eventType),
      } satisfies ResolvedWidget,
      lane: meta.lane,
      order: row ? row.order : meta.defaultOrder,
      // A widget with no stored row sorts by its default position, which can
      // collide with a stored one. Tie-break on the default order so the result
      // is stable rather than dependent on Prisma's row ordering.
      defaultOrder: meta.defaultOrder,
    }
  })

  resolved.sort((a, b) => a.order - b.order || a.defaultOrder - b.defaultOrder)

  return {
    kpis: resolved.filter((r) => r.lane === "kpi").map((r) => r.widget),
    cards: resolved.filter((r) => r.lane === "card").map((r) => r.widget),
    droppedKeys: [...droppedKeys],
  }
}

/** The default layout, i.e. what an event with no stored rows resolves to. */
export function defaultDashboardLayout(
  eventType: EventType,
  modules: readonly EventModuleType[]
): DashboardLayout {
  return resolveDashboardLayout([], eventType, modules)
}

/** Just the widgets that render, in order. */
export function visibleLayout(layout: DashboardLayout): DashboardLayout {
  return {
    kpis: layout.kpis.filter((w) => w.visible),
    cards: layout.cards.filter((w) => w.visible),
    droppedKeys: layout.droppedKeys,
  }
}

/**
 * Whether the grid should close its own rows.
 *
 * Only when something was removed for unavailability. An admin who drags two
 * cards to a third each and leaves a third of the row empty meant to do that,
 * and having the last card spring back to fill the row fights the resize handle.
 * But a widget vanishing because its module was switched off is not a layout
 * anyone chose — it leaves a hole in a row that was deliberately full, which is
 * the bug the fixed `xl:grid-cols-3` breakdown row used to have.
 *
 * The trade-off, deliberately accepted: once anything is dropped, intentional
 * gaps elsewhere on the page close up too.
 *
 * Only **card-lane** drops count. Packing closes holes in the 12-column card
 * grid, and a missing KPI leaves no hole there — that lane sizes itself from its
 * own tile count (`kpiGridClass`). Counting KPI drops here meant gating a single
 * tile on event type silently re-packed every card row on that type, which is
 * nothing the admin asked for and unrelated to the tile that went.
 */
export function shouldPackRows(layout: DashboardLayout): boolean {
  return layout.droppedKeys.some((key) => DASHBOARD_WIDGETS[key].lane === "card")
}

/** Every visible key across both lanes — for gating server-side data loading. */
export function visibleWidgetKeys(layout: DashboardLayout): Set<DashboardWidgetKey> {
  const keys = new Set<DashboardWidgetKey>()
  for (const widget of [...layout.kpis, ...layout.cards]) {
    if (widget.visible) keys.add(widget.key)
  }
  return keys
}

// ─── Grid packing ────────────────────────────────────────────────────────────

export const GRID_COLUMNS = 12

/**
 * Stretch the last card in each row to fill the row.
 *
 * Cards flow greedily into 12-column rows, and any row that doesn't add up
 * leaves a hole — which is exactly the bug the fixed layout already had: the
 * breakdown row was a three-column grid whose middle card (Volunteer Status) is
 * gated on a module, so turning the module off left a gap. With arbitrary
 * visibility that would happen constantly, so the grid closes its own rows.
 *
 * Widths are only widened, never shrunk: a card the admin sized down stays down
 * unless it is the one left holding an incomplete row.
 */
export function packCardRow(cards: readonly ResolvedWidget[]): ResolvedWidget[] {
  return groupIntoRows(cards).flatMap((row) => {
    if (row.slack === 0 || row.cards.length === 0) return row.cards
    const last = row.cards[row.cards.length - 1]
    return [
      ...row.cards.slice(0, -1),
      // Always lands back on a legal span: `last + slack` is `12 - rest`, and
      // `rest` can never exceed `12 - MIN_CARD_WIDTH`.
      { ...last, width: (last.width + row.slack) as WidgetWidth },
    ]
  })
}

export type CardRow = {
  cards: ResolvedWidget[]
  /** Columns left empty at the end of this row. */
  slack: number
}

/**
 * Walk the cards into 12-column rows exactly as CSS grid will lay them out.
 *
 * Shared so the packing above and customize mode's empty-slot placeholders can
 * never disagree about where a row ends — the placeholder has to sit precisely
 * where the grid leaves a hole, or it points at the wrong gap.
 */
export function groupIntoRows(cards: readonly ResolvedWidget[]): CardRow[] {
  const rows: CardRow[] = []
  let current: ResolvedWidget[] = []
  let width = 0

  const close = () => {
    if (current.length === 0) return
    rows.push({ cards: current, slack: GRID_COLUMNS - width })
    current = []
    width = 0
  }

  for (const card of cards) {
    if (width + card.width > GRID_COLUMNS) close()
    current.push(card)
    width += card.width
  }
  close()

  return rows
}

/**
 * How many columns the KPI lane should use for `count` tiles.
 *
 * Up to five tiles get one column each — the fixed layout did the same thing,
 * switching between four and five columns depending on whether the Volunteers
 * module added a fifth. Beyond that the tiles wrap into balanced rows rather
 * than shrinking further, since nine of them in a row would be unreadable.
 */
export function kpiColumnCount(count: number): number {
  if (count <= 0) return 1
  if (count <= 5) return count
  const rows = Math.ceil(count / 5)
  return Math.ceil(count / rows)
}

/**
 * Grid classes, spelled out because Tailwind can't see interpolated names.
 *
 * The md tier is a coarse two-column approximation of the same intent: cards up
 * to half-width pair up, wider ones take the row.
 */
export const WIDTH_CLASS: Record<WidgetWidth, string> = {
  3: "md:col-span-1 xl:col-span-3",
  4: "md:col-span-1 xl:col-span-4",
  5: "md:col-span-1 xl:col-span-5",
  6: "md:col-span-1 xl:col-span-6",
  7: "md:col-span-2 xl:col-span-7",
  8: "md:col-span-2 xl:col-span-8",
  9: "md:col-span-2 xl:col-span-9",
  10: "md:col-span-2 xl:col-span-10",
  11: "md:col-span-2 xl:col-span-11",
  12: "md:col-span-2 xl:col-span-12",
}

const KPI_GRID_CLASS: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
}

/** The KPI lane's column class for a given tile count. */
export function kpiGridClass(count: number): string {
  return KPI_GRID_CLASS[kpiColumnCount(count)]
}

/**
 * The span a resize drag lands on: where the card started, plus how far the
 * pointer moved, snapped to the nearest column and clamped to the legal range.
 *
 * Pure so the drag maths can be tested without a layout engine — jsdom reports
 * every element as zero-sized, so the handle itself can only be exercised by
 * hand. `columnPx` is one column *plus* one gap, since dragging across a column
 * boundary also crosses the gutter beside it.
 */
export function snapWidth(startWidth: number, deltaPx: number, columnPx: number): WidgetWidth {
  if (!Number.isFinite(columnPx) || columnPx <= 0) {
    return clampWidth(startWidth)
  }
  return clampWidth(startWidth + Math.round(deltaPx / columnPx))
}

/** Nearest legal span to `value`. */
export function clampWidth(value: number): WidgetWidth {
  const rounded = Math.round(value)
  if (rounded <= MIN_CARD_WIDTH) return MIN_CARD_WIDTH
  if (rounded >= GRID_COLUMNS) return GRID_COLUMNS
  return rounded as WidgetWidth
}
