"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  GRID_COLUMNS,
  MIN_CARD_WIDTH,
  WIDTH_LABELS,
  clampWidth,
  snapWidth,
  type WidgetWidth,
} from "@/lib/events/dashboard-widgets"

/**
 * Drag the right edge of a card to resize it in column steps.
 *
 * Pointer capture rather than window listeners: the card reflows out from under
 * the pointer as the width changes, so without capture the very first snap would
 * drop the drag. `columnPx` comes from `useGridColumnWidth` and is 0 until the
 * grid is measured, which `snapWidth` reads as "hold the current width".
 *
 * Also a real slider for the keyboard: dnd-kit's KeyboardSensor covers reorder,
 * and this covers resize, so customize mode has no mouse-only capability.
 */
export function ResizeHandle({
  label,
  width,
  columnPx,
  onResize,
  onCommit,
}: {
  /** The widget being resized, for the accessible name. */
  label: string
  width: WidgetWidth
  columnPx: number
  onResize: (width: WidgetWidth) => void
  /** Called once when a drag ends, so a drag is one undo step rather than ten. */
  onCommit?: () => void
}) {
  const [dragging, setDragging] = React.useState(false)
  const start = React.useRef({ x: 0, width })

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Left button only; and never let the drag bubble into dnd-kit's sensor,
    // or grabbing the edge would pick the whole card up instead.
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    start.current = { x: event.clientX, width }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const next = snapWidth(start.current.width, event.clientX - start.current.x, columnPx)
    if (next !== width) onResize(next)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    onCommit?.()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      const next = clampWidth(width + step)
      if (next !== width) {
        onResize(next)
        onCommit?.()
      }
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      onResize(event.key === "Home" ? MIN_CARD_WIDTH : GRID_COLUMNS)
      onCommit?.()
    }
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} width`}
      aria-valuenow={width}
      aria-valuemin={MIN_CARD_WIDTH}
      aria-valuemax={GRID_COLUMNS}
      aria-valuetext={`${width} of ${GRID_COLUMNS} columns`}
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      // Hidden below md, where the grid is a single column and width means
      // nothing. Reorder still works there.
      className={cn(
        "absolute inset-y-3 -right-2 z-20 hidden w-4 cursor-col-resize touch-none items-center justify-center rounded md:flex",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <span
        className={cn(
          "h-10 w-1 rounded-full bg-border transition-colors",
          dragging ? "bg-primary" : "group-hover/widget:bg-primary/60"
        )}
      />
      {dragging && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-background tabular-nums">
          {width} / {GRID_COLUMNS} · {WIDTH_LABELS[width]}
        </span>
      )}
    </div>
  )
}
