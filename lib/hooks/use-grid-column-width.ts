"use client"

import * as React from "react"

import { GRID_COLUMNS } from "@/lib/events/dashboard-widgets"

/**
 * How many pixels the pointer must travel to move a card one column.
 *
 * A 12-column grid `gridWidth` wide with gutter `gap` gives each column
 * `(gridWidth - 11·gap) / 12`, but growing a card by one column also swallows
 * the gutter beside it — so one *step* is a column plus a gap, which reduces to
 * `(gridWidth + gap) / 12`.
 *
 * Returns 0 until the grid has been measured. `snapWidth` treats that as "don't
 * move", which is what keeps the very first pointer event of a drag — fired
 * before any observer callback — from slamming the card into a clamp bound.
 */
export function useGridColumnWidth(ref: React.RefObject<HTMLElement | null>) {
  const [step, setStep] = React.useState(0)

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return

    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width <= 0) {
        setStep(0)
        return
      }
      // Read the gap off the element rather than hardcoding it, so changing the
      // grid's `gap-*` class can't silently desync the drag from the layout.
      const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0
      setStep((width + gap) / GRID_COLUMNS)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return step
}
