"use client"

import { IconCheck, IconX } from "@tabler/icons-react"
import type { ImportResult } from "@/lib/import/types"

type Props = {
  result: ImportResult
}

export function StepResults({ result }: Props) {
  const hasErrors = result.errors.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Created" value={result.created} color="green" />
        <StatCard label="Linked" value={result.linked} color="blue" />
        <StatCard label="Updated" value={result.updated} color="purple" />
        <StatCard label="Skipped" value={result.skipped} color="gray" />
      </div>

      {/* Overall status */}
      <div className={[
        "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium",
        hasErrors ? "bg-destructive/10 text-destructive" : "bg-green-50 text-green-800",
      ].join(" ")}>
        {hasErrors ? (
          <IconX className="size-4 shrink-0" />
        ) : (
          <IconCheck className="size-4 shrink-0" />
        )}
        {hasErrors
          ? `Import completed with ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}.`
          : `Import completed successfully. ${result.total} row${result.total !== 1 ? "s" : ""} processed.`}
      </div>

      {/* Error list */}
      {hasErrors && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Errors</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
            {result.errors.map((err, i) => (
              <div key={i} className="flex gap-2 px-3 py-2 text-xs">
                <span className="text-muted-foreground shrink-0">Row {err.row + 1}:</span>
                <span className="text-destructive">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green:  "bg-green-50 text-green-700",
    blue:   "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    gray:   "bg-muted text-muted-foreground",
  }
  return (
    <div className={`rounded-lg px-4 py-3 text-center ${colorMap[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  )
}
