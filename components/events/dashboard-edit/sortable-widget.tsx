"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconEyeOff, IconGripVertical } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import {
  DASHBOARD_WIDGETS,
  WIDTH_CLASS,
  WIDTH_LABELS,
  type DashboardWidgetKey,
  type ResolvedWidget,
  type WidgetWidth,
} from "@/lib/events/dashboard-widgets"
import { WIDGET_COMPONENTS } from "@/app/(event)/event/[id]/dashboard/widgets"
import type { EventDashboardData } from "@/app/(event)/event/[id]/dashboard/shared"

import { ResizeHandle } from "./resize-handle"

/**
 * One widget in the grid — the same component in both modes.
 *
 * View mode renders exactly what it always did: a span wrapper around the real
 * widget. Customize mode adds chrome on top and makes the card draggable, but
 * the widget underneath still renders live data, which is the whole point of
 * editing in place rather than in a drawer.
 */
export function SortableWidget({
  widget,
  event,
  editing,
  columnPx,
  onHide,
  onResize,
}: {
  widget: ResolvedWidget
  event: EventDashboardData
  editing: boolean
  columnPx: number
  onHide: (key: DashboardWidgetKey) => void
  onResize: (key: DashboardWidgetKey, width: WidgetWidth) => void
}) {
  const meta = DASHBOARD_WIDGETS[widget.key]
  const Widget = WIDGET_COMPONENTS[widget.key]
  const isKpi = meta.lane === "kpi"

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.key,
    disabled: !editing,
  })

  return (
    <div
      ref={setNodeRef}
      style={
        editing
          ? { transform: CSS.Translate.toString(transform), transition }
          : undefined
      }
      className={cn(
        "group/widget relative",
        // KPI tiles size themselves from the lane's column count; only cards
        // carry a span.
        !isKpi && WIDTH_CLASS[widget.width],
        editing && "rounded-lg ring-2 ring-primary/25",
        isDragging && "z-10 opacity-40"
      )}
      data-widget={widget.key}
      data-width={widget.width}
    >
      {/* Content stops being interactive while editing, so a chart tooltip or a
          drill-down link can't fire from what is really a drag.

          `h-full *:h-full` carries the row height the grid gives this wrapper
          all the way down to the widget itself — without it the tiles in a row
          each stop at their own content height and the borders come out ragged. */}
      <div
        className={cn(
          "h-full *:h-full",
          editing && "pointer-events-none select-none"
        )}
      >
        <Widget event={event} />
      </div>

      {editing && (
        <>
          <div className="absolute -top-2.5 left-2 z-20 flex items-center gap-1">
            {/* Icon only — the card underneath already shows its title, and
                repeating it here just doubles every label on the page. */}
            <button
              type="button"
              className="flex cursor-grab items-center rounded border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground active:cursor-grabbing"
              aria-label={`Move ${meta.label}`}
              {...attributes}
              {...listeners}
            >
              <IconGripVertical className="size-3" />
            </button>
            {!isKpi && (
              <span className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm tabular-nums">
                {WIDTH_LABELS[widget.width]}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onHide(widget.key)}
            aria-label={`Hide ${meta.label}`}
            className="absolute -top-2.5 right-2 z-20 rounded border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <IconEyeOff className="size-3" />
          </button>

          {!isKpi && (
            <ResizeHandle
              label={meta.label}
              width={widget.width}
              columnPx={columnPx}
              onResize={(width) => onResize(widget.key, width)}
            />
          )}
        </>
      )}
    </div>
  )
}

/** What follows the pointer during a drag — deliberately not a live chart. */
export function WidgetDragGhost({ widgetKey }: { widgetKey: DashboardWidgetKey }) {
  const meta = DASHBOARD_WIDGETS[widgetKey]
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg">
      <IconGripVertical className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">{meta.label}</span>
    </div>
  )
}
