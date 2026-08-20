"use client"

import * as React from "react"
import { IconDownload, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  defaultSelectedColumns,
  type ExportColumnState,
} from "@/lib/exports/columns"

/**
 * The column picker every CSV export with a column offer opens.
 *
 * Exposed as a **hook returning `{ open, dialog }`** rather than a component
 * with its own button. Most exports are utility actions that live inside the
 * `⋯` overflow menu as a `PageAction` (see the PageActions convention in
 * CLAUDE.md), so the dialog can't own its trigger — the screen calls `open()`
 * from the menu item's `onSelect` and renders `dialog` wherever it likes.
 * Fetching from that call rather than from an effect also keeps the round trip
 * in an event handler, where it belongs.
 *
 * The caller supplies both halves of the round trip: `load` fetches the rows and
 * the column offer from a server action, `download` turns the ticked keys into a
 * file. Keeping both outside means one dialog serves every row shape.
 */

type Result<T> = { success: true; data: T } | { success: false; error: string }

type Options<Row, G extends string> = {
  title: string
  description: React.ReactNode
  /** Every group, in the order they should appear. Empty ones are dropped. */
  groups: readonly G[]
  /** What a row is, for the count and the success toast: ["person", "people"]. */
  unit: [string, string]
  /** Shown as a toast when the surface has nothing to export. */
  emptyMessage: string
  /** Copy for the loading state, e.g. "Gathering registrations…". */
  loadingMessage?: string
  load: () => Promise<Result<{ rows: Row[]; columns: ExportColumnState<G>[] }>>
  download: (rows: Row[], selectedKeys: string[]) => void
}

export function useExportColumnsDialog<Row, G extends string>({
  title,
  description,
  groups,
  unit,
  emptyMessage,
  loadingMessage = "Gathering rows…",
  load,
  download,
}: Options<Row, G>): { open: () => void; dialog: React.ReactNode } {
  const [isOpen, setIsOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<{
    rows: Row[]
    columns: ExportColumnState<G>[]
  } | null>(null)
  const [selected, setSelected] = React.useState<string[]>([])

  async function open() {
    // Show the dialog immediately, then fill it — a spinner in place beats a
    // menu item that looks inert while the server works.
    setIsOpen(true)
    setData(null)
    setLoading(true)
    const result = await load()
    setLoading(false)

    if (!result.success) {
      setIsOpen(false)
      toast.error(result.error)
      return
    }
    if (result.data.rows.length === 0) {
      setIsOpen(false)
      toast.info(emptyMessage)
      return
    }
    setData(result.data)
    setSelected(defaultSelectedColumns(result.data.columns))
  }

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function handleDownload() {
    if (!data) return
    download(data.rows, selected)
    setIsOpen(false)
    const count = data.rows.length
    toast.success(`Exported ${count} ${count === 1 ? unit[0] : unit[1]}.`)
  }

  // Only groups with columns on offer — a surface that gathers nothing extra
  // shouldn't show five empty headings.
  const shown = groups
    .map((group) => ({
      group,
      columns: (data?.columns ?? []).filter((c) => c.group === group),
    }))
    .filter((g) => g.columns.length > 0)

  const count = data?.rows.length ?? 0

  const dialog = (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" />
            {loadingMessage}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                {selected.length} of {data.columns.length} columns · {count}{" "}
                {count === 1 ? unit[0] : unit[1]}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(defaultSelectedColumns(data.columns))}
                >
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {shown.map(({ group, columns }) => (
                <div key={group} className="space-y-2">
                  <h4 className="type-label text-muted-foreground">{group}</h4>
                  <div className="space-y-1.5">
                    {columns.map((column) => (
                      <label
                        key={column.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selected.includes(column.key)}
                          onCheckedChange={() => toggle(column.key)}
                        />
                        <span className="flex-1">{column.label}</span>
                        {!column.core && !column.collected && (
                          <Badge
                            variant="outline"
                            className="font-normal text-muted-foreground"
                          >
                            No longer asked
                          </Badge>
                        )}
                        {!column.core && column.collected && !column.hasData && (
                          <span className="text-xs text-muted-foreground">
                            No answers yet
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Fields your forms currently ask for are listed here. A field marked{" "}
              <span className="font-medium">No longer asked</span> was switched off
              but still holds answers, so it stays available.
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={!data || selected.length === 0}>
            <IconDownload className="size-4" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { open, dialog }
}
