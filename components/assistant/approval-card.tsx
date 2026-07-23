"use client"

import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const WRITE_TOOL_TITLES: Record<string, string> = {
  create_member: "Create member",
  update_member: "Update member",
  create_guest: "Create guest",
  update_guest: "Update guest",
  promote_guest_to_member: "Promote guest to member",
  add_member_to_small_group: "Add member to DGroup",
  assign_guest_to_group_temporarily: "Assign guest to group (pending leader confirmation)",
  mark_registrant_paid: "Mark registrant as paid",
  mark_registrant_attended: "Mark registrant as attended",
}

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** Flatten a tool input (one level of nesting, e.g. `patch`) into label/value rows. */
function summarizeInput(input: unknown): { label: string; value: string }[] {
  if (input == null || typeof input !== "object") return []
  const rows: { label: string; value: string }[] = []
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        if (v2 === undefined || v2 === null || v2 === "") continue
        rows.push({ label: labelize(k2), value: String(v2) })
      }
    } else {
      rows.push({
        label: labelize(key),
        value: Array.isArray(value) ? value.join(", ") : String(value),
      })
    }
  }
  return rows
}

export function ApprovalCard({
  toolName,
  input,
  responded,
  approved,
  onRespond,
}: {
  toolName: string
  input: unknown
  /** True once the user has answered (card becomes a passive record). */
  responded: boolean
  /** Meaningful only when responded. */
  approved?: boolean
  onRespond: (approved: boolean) => void
}) {
  const rows = summarizeInput(input)
  return (
    <Card className="border-amber-500/40 py-2.5">
      <CardContent className="space-y-2 px-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <IconAlertTriangle className="size-4 text-amber-500" />
          {WRITE_TOOL_TITLES[toolName] ?? labelize(toolName)}
        </div>
        {rows.length > 0 && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
            {rows.map((r, i) => (
              <div key={`${r.label}-${i}`} className="contents">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="font-medium break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {responded ? (
          <p className="text-xs text-muted-foreground">
            {approved ? "Approved — executing…" : "Cancelled."}
          </p>
        ) : (
          <div className="flex gap-2 pt-0.5">
            <Button size="sm" className="h-7" onClick={() => onRespond(true)}>
              <IconCheck className="size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => onRespond(false)}
            >
              <IconX className="size-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
