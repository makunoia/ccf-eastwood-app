"use client"

import * as React from "react"
import { IconCheck, IconX, IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import type { ImportResult } from "@/lib/import/types"

type ErrorGroup = { message: string; rows: number[] }

function groupErrors(errors: ImportResult["errors"]): ErrorGroup[] {
  const map = new Map<string, number[]>()
  for (const err of errors) {
    const rows = map.get(err.message) ?? []
    rows.push(err.row)
    map.set(err.message, rows)
  }
  return Array.from(map.entries()).map(([message, rows]) => ({ message, rows }))
}

function formatRowList(rows: number[]): string {
  if (rows.length <= 10) return rows.map((r) => r + 1).join(", ")
  return rows.slice(0, 10).map((r) => r + 1).join(", ") + ` +${rows.length - 10} more`
}

type Props = { result: ImportResult }

export function StepResults({ result }: Props) {
  const hasErrors = result.errors.length > 0
  const errorGroups = React.useMemo(() => groupErrors(result.errors), [result.errors])
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(errorGroups.length <= 3 ? errorGroups.map((g) => g.message) : [])
  )

  function toggle(message: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(message)) {
        next.delete(message)
      } else {
        next.add(message)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Created"  value={result.created}  color="green"  />
        <StatCard label="Linked"   value={result.linked}   color="blue"   />
        <StatCard label="Updated"  value={result.updated}  color="purple" />
        <StatCard label="Skipped"  value={result.skipped}  color="gray"   />
      </div>

      {/* Overall status */}
      <div className={[
        "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium",
        hasErrors ? "bg-destructive/10 text-destructive" : "bg-green-50 text-green-800",
      ].join(" ")}>
        {hasErrors ? <IconX className="size-4 shrink-0" /> : <IconCheck className="size-4 shrink-0" />}
        {hasErrors
          ? `Import completed with ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""} across ${errorGroups.length} issue type${errorGroups.length !== 1 ? "s" : ""}.`
          : `Import completed successfully. ${result.total} row${result.total !== 1 ? "s" : ""} processed.`}
      </div>

      {/* Grouped error list */}
      {hasErrors && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Errors</p>
            {errorGroups.length > 1 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  setExpanded(
                    expanded.size === errorGroups.length
                      ? new Set()
                      : new Set(errorGroups.map((g) => g.message))
                  )
                }
              >
                {expanded.size === errorGroups.length ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>

          <div className="rounded-lg border divide-y overflow-hidden max-h-[min(360px,45vh)] overflow-y-auto">
            {errorGroups.map((group) => {
              const isExpanded = expanded.has(group.message)
              return (
                <div key={group.message}>
                  <button
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => toggle(group.message)}
                  >
                    {isExpanded
                      ? <IconChevronDown className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      : <IconChevronRight className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                    <span className="flex-1 min-w-0 text-xs text-destructive wrap-break-word">{group.message}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {group.rows.length} row{group.rows.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-2.5 pt-0 pl-8">
                      <p className="text-xs text-muted-foreground">
                        Row{group.rows.length !== 1 ? "s" : ""}: {formatRowList(group.rows)}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
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
