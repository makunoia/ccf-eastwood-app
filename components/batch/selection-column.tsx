"use client"

import { type ColumnDef } from "@tanstack/react-table"

import { Checkbox } from "@/components/ui/checkbox"
import { useBatchSelection } from "./batch-selection-provider"

/**
 * A reusable leading checkbox column wired to {@link BatchSelectionProvider}.
 * Prepend it to an entity's column list (only when the user can write).
 *
 * `getId` extracts the row id; defaults to `row.id` which fits every list table
 * in the app.
 */
export function buildSelectionColumn<TData>(
  getId: (row: TData) => string = (row) => (row as { id: string }).id
): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: function SelectAllHeader() {
      const selection = useBatchSelection()
      if (!selection) return null
      return (
        <Checkbox
          checked={
            selection.allSelected
              ? true
              : selection.someSelected
                ? "indeterminate"
                : false
          }
          onCheckedChange={() => selection.toggleAll()}
          aria-label="Select all rows"
        />
      )
    },
    cell: function SelectRowCell({ row }) {
      const selection = useBatchSelection()
      if (!selection) return null
      const id = getId(row.original)
      return (
        <Checkbox
          checked={selection.isSelected(id)}
          onCheckedChange={() => selection.toggle(id)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      )
    },
  }
}
