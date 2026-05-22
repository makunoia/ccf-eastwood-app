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
  const alreadyCheckedInRows = rows.filter((r) => r.duplicate && r.duplicate.kind !== "recognized")
  const recognizedRows       = rows.filter((r) => r.duplicate?.kind === "recognized")
  const errorRows            = rows.filter((r) => r.validationError)

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
        {alreadyCheckedInRows.length > 0 && (
          <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50">
            {alreadyCheckedInRows.length} already checked in
          </Badge>
        )}
        {recognizedRows.length > 0 && (
          <Badge variant="outline" className="text-blue-700 border-blue-400 bg-blue-50">
            {recognizedRows.length} existing {recognizedRows.length !== 1 ? "records" : "record"}
          </Badge>
        )}
        {errorRows.length > 0 && (
          <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/5">
            {errorRows.length} invalid
          </Badge>
        )}
      </div>

      {/* Global duplicate resolution controls — only for already-checked-in rows */}
      {alreadyCheckedInRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm">
          <IconAlertTriangle className="size-4 text-yellow-600 shrink-0" />
          <span className="text-yellow-800 flex-1">
            {alreadyCheckedInRows.length} row{alreadyCheckedInRows.length !== 1 ? "s" : ""} already checked in for this session.
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetAllResolution("use-existing")}>
              Skip all
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetAllResolution("use-csv")}>
              Re-import all
            </Button>
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="overflow-x-auto rounded-lg border max-h-[min(360px,40vh)] overflow-y-auto">
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
            {rows.map((row) => {
              const isCheckedIn  = row.duplicate && row.duplicate.kind !== "recognized"
              const isRecognized = row.duplicate?.kind === "recognized"
              return (
                <React.Fragment key={row.index}>
                  <tr
                    className={[
                      "border-b",
                      isCheckedIn  ? "bg-yellow-50" : "",
                      isRecognized ? "bg-blue-50/40" : "",
                      row.validationError ? "bg-destructive/5" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2 text-muted-foreground text-xs">{row.index + 1}</td>
                    {fields.map((f) => (
                      <td key={f.key} className="px-3 py-2 max-w-40 truncate text-xs">
                        {row.mapped[f.key] || <span className="text-muted-foreground/40">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {row.validationError ? (
                        <span className="text-xs text-destructive">{row.validationError}</span>
                      ) : isCheckedIn ? (
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50 text-xs">
                          Already checked in
                        </Badge>
                      ) : isRecognized ? (
                        <Badge variant="outline" className="text-blue-700 border-blue-400 bg-blue-50 text-xs">
                          Existing
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">New</Badge>
                      )}
                    </td>
                  </tr>

                  {/* Already checked in — show resolution controls */}
                  {isCheckedIn && row.duplicate && (
                    <tr className="border-b bg-yellow-50/60">
                      <td />
                      <td colSpan={fields.length + 1} className="px-3 pb-2.5">
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs text-yellow-800 font-medium">
                            Already checked in as{" "}
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
                              <span className="text-xs">Skip</span>
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
                              <span className="text-xs">Re-import</span>
                            </label>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Recognized — informational only, no resolution needed */}
                  {isRecognized && row.duplicate && (
                    <tr className="border-b bg-blue-50/30">
                      <td />
                      <td colSpan={fields.length + 1} className="px-3 pb-2.5">
                        <p className="text-xs text-blue-700">
                          Matches existing{" "}
                          <span className="font-semibold">{row.duplicate.existingType}</span>{" "}
                          <span className="font-semibold">{row.duplicate.existingName}</span>
                          {row.duplicate.existingEmail && ` (${row.duplicate.existingEmail})`}
                          {" — will be linked on import"}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
