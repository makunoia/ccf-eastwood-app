"use client"

import { IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

/**
 * The "N selected ✕" cluster that opens every batch-action bar.
 *
 * It was two loose controls — a ghost icon button and a bare span — sitting in
 * the same row as Approve and Deny at the same weight, so the ✕ read as a third
 * action and the count read as nothing at all. Now they're one status chip, with
 * a hairline dividing status from action.
 *
 * Neutral on purpose. The primary action in these bars already carries Reliably
 * Blue; a tinted chip beside it would flatten the one piece of hierarchy the bar
 * depends on. The count is information, and information doesn't wear the action
 * colour — it earns its presence through shape, weight contrast, and separation.
 */
export function SelectionSummary({
  count,
  onClear,
}: {
  count: number
  onClear: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 rounded-full border bg-muted py-1 pl-3 pr-1">
        <p className="whitespace-nowrap text-sm">
          {/* Tabular figures so the bar doesn't shift as the count crosses a digit. */}
          <span className="font-semibold tabular-nums">{count}</span>{" "}
          {/* foreground/60, not muted-foreground: muted-on-muted measures 4.35:1 in
              light mode, just under the 4.5:1 AA floor. This clears it at 5.1:1
              (6.1:1 dark) and still reads a full step back from the count. */}
          <span className="text-foreground/60">selected</span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          // 24px against the 36px actions — subordinate, and it dismisses the chip
          // it sits in rather than competing with the buttons after the divider.
          className="size-6 rounded-full text-foreground/60 transition-colors hover:bg-background hover:text-foreground"
          onClick={onClear}
          aria-label={`Clear selection of ${count} ${count === 1 ? "row" : "rows"}`}
        >
          <IconX className="size-3.5" />
        </Button>
      </div>
      {/* Shipped with the chip, never as a caller's choice — the separation is the
          whole point, and an omitted divider puts the bar back where it started. */}
      <Separator orientation="vertical" className="mx-1 h-6" />
    </>
  )
}
