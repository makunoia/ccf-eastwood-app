"use client"

import * as React from "react"
import { IconAlertTriangle } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FieldDefinition, PreviewRow, RowResolution } from "@/lib/import/types"

type Props = {
  fields: FieldDefinition[]
  rows: PreviewRow[]
  checking: boolean
  onResolutionChange: (rowIndex: number, resolution: RowResolution) => void
  onSetAllResolution: (resolution: RowResolution) => void
}

export function StepPreview({ fields, rows, checking, onResolutionChange, onSetAllResolution }: Props) {
  const duplicateRows = rows.filter((r) => r.duplicate)
  const errorRows = rows.filter((r) => r.validationError)

  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">Checking for duplicates…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""} found</span>
        {duplicateRows.length > 0 && (
          <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50">
            {duplicateRows.length} duplicate{duplicateRows.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {errorRows.length > 0 && (
          <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/5">
            {errorRows.length} invalid
          </Badge>
        )}
      </div>

      {/* Global duplicate resolution controls */}
      {duplicateRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm">
          <IconAlertTriangle className="size-4 text-yellow-600 shrink-0" />
          <span className="text-yellow-800 flex-1">
            {duplicateRows.length} row{duplicateRows.length !== 1 ? "s" : ""} match existing records.
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetAllResolution("use-existing")}>
              Keep all existing
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetAllResolution("use-csv")}>
              Use all CSV data
            </Button>
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="overflow-x-auto rounded-lg border max-h-[360px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs w-10">#</th>
              {fields.map((f) => (
                <th key={f.key} className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.index}>
                <tr
                  className={[
                    "border-b",
                    row.duplicate ? "bg-yellow-50" : "",
                    row.validationError ? "bg-destructive/5" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.index + 1}</td>
                  {fields.map((f) => (
                    <td key={f.key} className="px-3 py-2 max-w-[160px] truncate text-xs">
                      {row.mapped[f.key] || <span className="text-muted-foreground/40">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {row.validationError ? (
                      <span className="text-xs text-destructive">{row.validationError}</span>
                    ) : row.duplicate ? (
                      <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50 text-xs">
                        Duplicate
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">New</Badge>
                    )}
                  </td>
                </tr>

                {/* Duplicate resolution row */}
                {row.duplicate && (
                  <tr className="border-b bg-yellow-50/60">
                    <td />
                    <td colSpan={fields.length + 1} className="px-3 pb-2.5">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs text-yellow-800 font-medium">
                          Matches existing{" "}
                          <span className="font-semibold">{row.duplicate.existingName}</span>
                          {row.duplicate.existingEmail && ` (${row.duplicate.existingEmail})`}
                        </p>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`dup-${row.index}`}
                              value="use-existing"
                              checked={row.resolution === "use-existing"}
                              onChange={() => onResolutionChange(row.index, "use-existing")}
                              className="accent-primary"
                            />
                            <span className="text-xs">Keep existing record</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`dup-${row.index}`}
                              value="use-csv"
                              checked={row.resolution === "use-csv"}
                              onChange={() => onResolutionChange(row.index, "use-csv")}
                              className="accent-primary"
                            />
                            <span className="text-xs">Update with CSV data</span>
                          </label>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
