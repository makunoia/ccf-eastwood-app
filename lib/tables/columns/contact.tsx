"use client"

import { type ColumnDef } from "@tanstack/react-table"

import { CopyableText } from "@/components/ui/copyable-text"

/**
 * Email and mobile columns, defined once.
 *
 * These two were previously copy-pasted into eight different `columns.tsx`
 * files and a couple of hand-rolled `<td>`s, which is how they ended up with
 * three different header labels ("Email", "Mobile", "Contact") and no shared
 * width. Both now carry their width token and their copy affordance with them,
 * so a screen adds a contact column rather than re-implementing one.
 *
 * Note the id/label split: the accessor is `phone` (matching the DB field) but
 * the header reads "Mobile", which is what staff call it.
 */

export function emailColumn<TData>(
  accessor: (row: TData) => string | null | undefined,
  options: { id?: string; header?: string; optIn?: boolean } = {},
): ColumnDef<TData> {
  const { id = "email", header = "Email", optIn } = options
  return {
    id,
    accessorFn: (row) => accessor(row) ?? "",
    header,
    meta: { label: header, width: "email", optIn },
    cell: ({ row }) => <CopyableText value={accessor(row.original)} label={header} />,
  }
}

export function phoneColumn<TData>(
  accessor: (row: TData) => string | null | undefined,
  options: { id?: string; header?: string; optIn?: boolean } = {},
): ColumnDef<TData> {
  const { id = "phone", header = "Mobile", optIn } = options
  return {
    id,
    accessorFn: (row) => accessor(row) ?? "",
    header,
    meta: { label: header, width: "phone", optIn },
    cell: ({ row }) => <CopyableText value={accessor(row.original)} label={header} />,
  }
}
