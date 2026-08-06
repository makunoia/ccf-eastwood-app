"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable"

import { cn } from "@/lib/utils"
import {
  groupIntoRows,
  kpiGridClass,
  packCardRow,
  shouldPackRows,
  visibleLayout,
  type DashboardLayout,
  type DashboardWidgetKey,
  type ResolvedWidget,
  type WidgetWidth,
} from "@/lib/events/dashboard-widgets"
import { useGridColumnWidth } from "@/lib/hooks/use-grid-column-width"
import type { EventDashboardData } from "@/app/(event)/event/[id]/dashboard/shared"

import { SortableWidget, WidgetDragGhost } from "./sortable-widget"

/**
 * The dashboard grid, in both view and customize mode.
 *
 * One component rather than a viewer plus an editor: customize mode is the same
 * grid with chrome on top, so what you arrange is literally what you'll see
 * afterwards, and the two layouts can't drift apart over time.
 */
export function EditableGrid({
  event,
  layout,
  editing,
  onChange,
}: {
  event: EventDashboardData
  layout: DashboardLayout
  editing: boolean
  onChange: (next: DashboardLayout) => void
}) {
  const gridRef = React.useRef<HTMLDivElement>(null)
  const columnPx = useGridColumnWidth(gridRef)
  const [dragging, setDragging] = React.useState<DashboardWidgetKey | null>(null)

  const sensors = useSensors(
    // A small distance threshold so clicking the hide button never reads as the
    // start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  )

  const shown = visibleLayout(layout)

  /**
   * Customize mode always shows the stored widths, never the auto-filled ones —
   * otherwise dragging a card to a third would display it at a half because it
   * happens to close a row, and the handle would appear to fight back. View mode
   * still closes rows orphaned by a module being switched off.
   */
  const cards = !editing && shouldPackRows(layout) ? packCardRow(shown.cards) : shown.cards
  const rows = groupIntoRows(cards)

  function update(lane: "kpis" | "cards", next: ResolvedWidget[]) {
    onChange({ ...layout, [lane]: next })
  }

  function handleDragStart(dragEvent: DragStartEvent) {
    setDragging(dragEvent.active.id as DashboardWidgetKey)
  }

  function handleDragEnd(dragEvent: DragEndEvent) {
    setDragging(null)
    const { active, over } = dragEvent
    if (!over || active.id === over.id) return

    // Lanes are separate sortable contexts; a drag that somehow crosses them is
    // ignored rather than silently moving a KPI tile into the card grid.
    const lane = layout.kpis.some((w) => w.key === active.id) ? "kpis" : "cards"
    const items = layout[lane]
    const from = items.findIndex((w) => w.key === active.id)
    const to = items.findIndex((w) => w.key === over.id)
    if (from < 0 || to < 0) return

    update(lane, arrayMove(items, from, to))
  }

  function handleHide(key: DashboardWidgetKey) {
    const lane = layout.kpis.some((w) => w.key === key) ? "kpis" : "cards"
    update(
      lane,
      layout[lane].map((w) => (w.key === key ? { ...w, visible: false } : w))
    )
  }

  function handleResize(key: DashboardWidgetKey, width: WidgetWidth) {
    update(
      "cards",
      layout.cards.map((w) => (w.key === key ? { ...w, width } : w))
    )
  }

  const body = (
    <>
      {shown.kpis.length > 0 && (
        <div
          className={cn(
            "mt-8 grid grid-cols-1 gap-3 md:grid-cols-2",
            kpiGridClass(shown.kpis.length)
          )}
        >
          <SortableContext
            items={shown.kpis.map((w) => w.key)}
            strategy={rectSortingStrategy}
          >
            {shown.kpis.map((widget) => (
              <SortableWidget
                key={widget.key}
                widget={widget}
                event={event}
                editing={editing}
                columnPx={columnPx}
                onHide={handleHide}
                onResize={handleResize}
              />
            ))}
          </SortableContext>
        </div>
      )}

      {cards.length > 0 && (
        <div
          ref={gridRef}
          className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12"
        >
          <SortableContext items={cards.map((w) => w.key)} strategy={rectSortingStrategy}>
            {rows.map((row, rowIndex) => (
              <React.Fragment key={rowIndex}>
                {row.cards.map((widget) => (
                  <SortableWidget
                    key={widget.key}
                    widget={widget}
                    event={event}
                    editing={editing}
                    columnPx={columnPx}
                    onHide={handleHide}
                    onResize={handleResize}
                  />
                ))}
                {/* Shows exactly where a short row leaves space, so the gap
                    reads as something to fill rather than as a rendering bug. */}
                {editing && row.slack > 0 && (
                  <div
                    aria-hidden
                    data-slot="empty-slot"
                    className={cn(
                      "hidden min-h-24 rounded-lg border border-dashed xl:block",
                      SLACK_CLASS[row.slack]
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </SortableContext>
        </div>
      )}

      {shown.kpis.length === 0 && cards.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          {editing
            ? "Every widget is hidden. Bring one back from the tray below."
            : "Every widget is hidden. Use Customize to bring some back."}
        </p>
      )}
    </>
  )

  if (!editing) return body

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {body}
      <DragOverlay>{dragging && <WidgetDragGhost widgetKey={dragging} />}</DragOverlay>
    </DndContext>
  )
}

/** Static spans for the empty-slot placeholder — Tailwind can't interpolate. */
const SLACK_CLASS: Record<number, string> = {
  1: "xl:col-span-1",
  2: "xl:col-span-2",
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  5: "xl:col-span-5",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
}
