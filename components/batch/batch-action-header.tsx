"use client"

import * as React from "react"
import { IconChecklist, IconTrash, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useBatchSelection } from "./batch-selection-provider"
import { BulkDeleteDialog } from "./bulk-delete-dialog"
import { BulkLifeStageDialog } from "./bulk-life-stage-dialog"
import { type BatchDeleteFn, type BatchLifeStageFn } from "./types"

type Props = {
  /** Singular entity noun, e.g. "guest". */
  entityLabel: string
  lifeStages: { id: string; name: string }[]
  onDelete: BatchDeleteFn
  onSetLifeStage: BatchLifeStageFn
  /** Normal header actions shown when nothing is selected. */
  children: React.ReactNode
}

/**
 * Swaps the page header's action area between the normal toolbar (no selection)
 * and a batch-action bar (≥1 selected). Renders the bulk-action dialogs.
 *
 * On mobile it also renders a "Select" toggle that enables checkbox selection
 * on the card list.
 */
export function BatchActionHeader({
  entityLabel,
  lifeStages,
  onDelete,
  onSetLifeStage,
  children,
}: Props) {
  const selection = useBatchSelection()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [lifeStageOpen, setLifeStageOpen] = React.useState(false)

  // Selection disabled (no write permission) — render the normal toolbar only.
  if (!selection?.enabled) return <>{children}</>

  const ids = [...selection.selectedIds]
  const count = ids.length

  if (count === 0) {
    return (
      <>
        {/* Mobile: enter/exit selection mode */}
        <Button
          variant={selection.selectMode ? "secondary" : "outline"}
          size="icon"
          className="md:hidden"
          aria-label={selection.selectMode ? "Done selecting" : "Select"}
          onClick={() => selection.setSelectMode(!selection.selectMode)}
        >
          {selection.selectMode ? (
            <IconX className="size-4" />
          ) : (
            <IconChecklist className="size-4" />
          )}
        </Button>
        {children}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => {
            selection.clear()
            selection.setSelectMode(false)
          }}
          aria-label="Clear selection"
        >
          <IconX className="size-4" />
        </Button>
        <span className="text-sm font-medium whitespace-nowrap">
          {count} selected
        </span>
        <Button variant="outline" onClick={() => setLifeStageOpen(true)}>
          Set life stage
        </Button>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <IconTrash className="size-4" />
          Delete
        </Button>
      </div>

      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        ids={ids}
        entityLabel={entityLabel}
        onDelete={onDelete}
      />
      <BulkLifeStageDialog
        open={lifeStageOpen}
        onOpenChange={setLifeStageOpen}
        ids={ids}
        lifeStages={lifeStages}
        onApply={onSetLifeStage}
      />
    </>
  )
}
