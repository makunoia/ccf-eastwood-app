"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { IconCopy, IconLayoutDashboard } from "@tabler/icons-react"
import { toast } from "sonner"

import { EventSetupChecklist } from "@/components/event-setup-checklist"
import type { EventSetupChecklist as EventSetupChecklistData } from "@/lib/events/setup-checklist"
import { EditableGrid } from "@/components/events/dashboard-edit/editable-grid"
import { EditModeBar } from "@/components/events/dashboard-edit/edit-mode-bar"
import { HiddenTray } from "@/components/events/dashboard-edit/hidden-tray"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  resetEventDashboardLayout,
  saveEventDashboardLayout,
} from "@/app/(dashboard)/events/dashboard-layout-actions"
import type { DashboardLayout, DashboardWidgetKey } from "@/lib/events/dashboard-widgets"

import { PERIODS, isSeriesEvent, type EventDashboardData } from "./shared"

/**
 * The dashboard shell: period toolbar, the widget grid, and customize mode.
 *
 * Which widgets render, in what order and at what width all come from the
 * resolved layout — this file no longer knows what any individual widget is.
 * See `lib/events/dashboard-widgets.ts`.
 */
export function EventDashboardClient({
  event,
  setup,
  layout,
}: {
  event: EventDashboardData
  setup: EventSetupChecklistData | null
  layout: DashboardLayout
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(layout)
  const [saving, setSaving] = React.useState(false)

  const active = editing ? draft : layout
  const hidden = [...active.kpis, ...active.cards].filter((w) => !w.visible)
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(layout)

  function startEditing() {
    // Seeded here rather than in an effect on `layout`: the prop is a fresh
    // object on every render, and an effect keyed on it would wipe the draft
    // mid-edit.
    setDraft(layout)
    setEditing(true)
  }

  function handleRestore(key: DashboardWidgetKey) {
    const lane = draft.kpis.some((w) => w.key === key) ? "kpis" : "cards"
    const restored = draft[lane].find((w) => w.key === key)
    if (!restored) return
    // Appended rather than returned to its old slot: it comes back where you can
    // see it, and it's already selected for dragging somewhere else.
    setDraft({
      ...draft,
      [lane]: [
        ...draft[lane].filter((w) => w.key !== key),
        { ...restored, visible: true },
      ],
    })
  }

  async function handleSave() {
    setSaving(true)
    const entries = [...draft.kpis, ...draft.cards].map((w) => ({
      key: w.key,
      visible: w.visible,
      width: w.width,
    }))
    const result = await saveEventDashboardLayout(event.id, entries)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Dashboard updated")
    setEditing(false)
    router.refresh()
  }

  async function handleReset() {
    setSaving(true)
    const result = await resetEventDashboardLayout(event.id)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Dashboard reset to defaults")
    setEditing(false)
    router.refresh()
  }

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div className="flex flex-1 flex-col p-6">
      {setup && !editing && (
        <div className="mb-6">
          <EventSetupChecklist eventId={event.id} checklist={setup} />
        </div>
      )}

      {/* Filters — reads as a toolbar, not a section */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-0.5">
          {PERIODS.map((period) => (
            <Link
              key={period.value}
              href={`${pathname}?period=${period.value}`}
              aria-disabled={editing}
              tabIndex={editing ? -1 : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                event.period === period.value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                // Changing the period reloads the page, which would throw away
                // an unsaved layout.
                editing && "pointer-events-none opacity-40"
              )}
            >
              {period.label}
            </Link>
          ))}
        </div>

        {!editing && (
          <div className="ml-auto flex items-center gap-2">
            {/* Check-in link — OneTime only (MultiDay/Recurring check-in is per
                occurrence via Sessions/Days) */}
            {!isSeriesEvent(event.type) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyLink(`/events/${event.id}/checkin`)}
              >
                <IconCopy className="mr-1.5 size-3.5" />
                Check-in link
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={startEditing}>
              <IconLayoutDashboard className="mr-1.5 size-3.5" />
              Customize
            </Button>
          </div>
        )}
      </div>

      <EditableGrid
        event={event}
        layout={active}
        editing={editing}
        onChange={setDraft}
      />

      {editing && (
        <>
          <HiddenTray hidden={hidden} onRestore={handleRestore} />
          <EditModeBar
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            onReset={handleReset}
          />
        </>
      )}
    </div>
  )
}
