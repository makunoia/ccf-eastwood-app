"use client"

import * as React from "react"
import { IconCheck, IconChecklist, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { SelectionSummary } from "@/components/batch/selection-summary"
import { RequestDecisionDialog } from "./request-decision-dialog"
import { type RequestDecision } from "./actions"

/**
 * The Requests tab's header slot — the same swap {@link BatchActionHeader} does
 * for the entity lists (mobile "Select" toggle when nothing is picked, action bar
 * when something is), but with approve/deny instead of delete/life-stage.
 *
 * It isn't a variant of `BatchActionHeader` because that component's actions are
 * fixed: every list it serves deletes rows and sets a life stage, and a request
 * does neither. What they share is the selection context, which is the part
 * worth sharing.
 */
export function RequestBatchActions() {
  const selection = useBatchSelection()
  const [decision, setDecision] = React.useState<RequestDecision | null>(null)

  if (!selection?.enabled) return null

  const ids = [...selection.selectedIds]
  const count = ids.length

  if (count === 0) {
    return (
      <Button
        variant={selection.selectMode ? "secondary" : "outline"}
        size="icon"
        className="md:hidden"
        aria-label={selection.selectMode ? "Done selecting" : "Select requests"}
        onClick={() => selection.setSelectMode(!selection.selectMode)}
      >
        {selection.selectMode ? (
          <IconX className="size-4" />
        ) : (
          <IconChecklist className="size-4" />
        )}
      </Button>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <SelectionSummary
          count={count}
          onClear={() => {
            selection.clear()
            selection.setSelectMode(false)
          }}
        />
        <Button variant="outline" onClick={() => setDecision("deny")}>
          <IconX className="size-4" />
          Deny
        </Button>
        <Button onClick={() => setDecision("approve")}>
          <IconCheck className="size-4" />
          Approve
        </Button>
      </div>

      <RequestDecisionDialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) setDecision(null)
        }}
        ids={ids}
        decision={decision ?? "approve"}
        onResolved={(failedIds) => {
          // Keep only what didn't take, so the admin sees exactly what's left.
          selection.replaceSelection(failedIds)
          if (failedIds.length === 0) selection.setSelectMode(false)
        }}
      />
    </>
  )
}
