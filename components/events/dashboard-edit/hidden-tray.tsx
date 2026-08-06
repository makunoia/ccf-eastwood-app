"use client"

import { IconPlus } from "@tabler/icons-react"

import { DASHBOARD_WIDGETS, type DashboardWidgetKey, type ResolvedWidget } from "@/lib/events/dashboard-widgets"

/**
 * Everything currently switched off, as chips below the grid.
 *
 * Hiding a widget has to leave a visible trace or it's gone for good — with the
 * drawer you could reopen the list to find it, but in customize mode the page
 * *is* the UI, so the tray is where hidden widgets live. Clicking a chip is the
 * restore path: it works with the keyboard and needs no pointer precision.
 */
export function HiddenTray({
  hidden,
  onRestore,
}: {
  hidden: ResolvedWidget[]
  onRestore: (key: DashboardWidgetKey) => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-dashed p-3">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
        Hidden
      </p>
      {hidden.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing hidden — every widget available for this event is on the page.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hidden.map((widget) => {
            const meta = DASHBOARD_WIDGETS[widget.key]
            return (
              <button
                key={widget.key}
                type="button"
                onClick={() => onRestore(widget.key)}
                aria-label={`Show ${meta.label}`}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
              >
                <IconPlus className="size-3" />
                {meta.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
