"use client"

import { IconLayoutDashboard } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

/**
 * The sticky bar that says you're in customize mode and gets you back out.
 *
 * Pinned to the bottom rather than the top: the grid is what you're working on,
 * and a top bar would sit between the toolbar and the tiles you're dragging.
 */
export function EditModeBar({
  dirty,
  saving,
  onSave,
  onCancel,
  onReset,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
  onReset: () => void
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-6 mt-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <IconLayoutDashboard className="size-4 text-muted-foreground" />
          <span className="font-medium">Customizing</span>
          <span className="hidden text-muted-foreground sm:inline">
            Drag a tile to move it, or pull its right edge to resize.
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
            Reset to defaults
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
