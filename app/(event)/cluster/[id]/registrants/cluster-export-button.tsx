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
import { exportClusterRegistrationsCSV } from "@/lib/export-entities"
import {
  CLUSTER_EXPORT_GROUPS,
  defaultSelectedColumns,
  type ClusterExportColumnState,
  type ClusterExportEvent,
  type ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"
import { getClusterRegistrationsExport } from "./export-actions"

type Props = {
  clusterId: string
  /** Base filename (no extension) for the downloaded CSV. */
  filename: string
  disabled?: boolean
}

type Loaded = {
  rows: ClusterRegistrationExportRow[]
  events: ClusterExportEvent[]
  columns: ClusterExportColumnState[]
}

export function ClusterExportButton({ clusterId, filename, disabled }: Props) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<Loaded | null>(null)
  const [selected, setSelected] = React.useState<string[]>([])

  async function handleOpen() {
    setOpen(true)
    setLoading(true)
    const result = await getClusterRegistrationsExport(clusterId)
    setLoading(false)

    if (!result.success) {
      setOpen(false)
      toast.error(result.error)
      return
    }
    if (result.data.rows.length === 0) {
      setOpen(false)
      toast.info("No registrants to export yet.")
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
    exportClusterRegistrationsCSV(filename, data.events, data.rows, selected)
    setOpen(false)
    toast.success(
      `Exported ${data.rows.length} registrant${data.rows.length === 1 ? "" : "s"}.`,
    )
  }

  // Only groups with columns on offer — a cluster whose forms ask for nothing
  // extra shouldn't show five empty headings.
  const groups = CLUSTER_EXPORT_GROUPS.map((group) => ({
    group,
    columns: (data?.columns ?? []).filter((c) => c.group === group),
  })).filter((g) => g.columns.length > 0)

  return (
    <>
      <Button variant="outline" onClick={handleOpen} disabled={disabled || loading}>
        <IconDownload className="size-4" />
        Export
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export registrants</DialogTitle>
            <DialogDescription>
              Everything the day&apos;s registration forms collected. One row per
              person — each of the day&apos;s events is a Yes/No column, so
              someone on three events is still a single row.
            </DialogDescription>
          </DialogHeader>

          {loading || !data ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" />
              Gathering registrations…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">
                  {selected.length} of {data.columns.length} columns ·{" "}
                  {data.rows.length} registrant{data.rows.length === 1 ? "" : "s"}
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
                {groups.map(({ group, columns }) => (
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
                            <Badge variant="outline" className="font-normal text-muted-foreground">
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
                Fields your registration forms currently ask for are listed here.
                A field marked <span className="font-medium">No longer asked</span> was
                switched off but still holds answers, so it stays available.
              </p>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDownload} disabled={!data || selected.length === 0}>
              <IconDownload className="size-4" />
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
