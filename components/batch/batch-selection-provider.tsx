"use client"

import * as React from "react"

type BatchSelectionContextValue = {
  /** Whether selection UI should be shown at all (gated on write permission). */
  enabled: boolean
  /** All row ids currently present in the filtered result set. */
  allIds: string[]
  selectedIds: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  /** Select or deselect every row in the current filtered set. */
  toggleAll: () => void
  clear: () => void
  /** Replace the whole selection (e.g. keep only rows that failed to delete). */
  replaceSelection: (ids: string[]) => void
  /** True when some but not all rows are selected. */
  allSelected: boolean
  someSelected: boolean
  /** Mobile-only: when true, cards show checkboxes and tap selects. */
  selectMode: boolean
  setSelectMode: (value: boolean) => void
}

const BatchSelectionContext =
  React.createContext<BatchSelectionContextValue | null>(null)

export function BatchSelectionProvider({
  allIds,
  enabled = true,
  children,
}: {
  allIds: string[]
  enabled?: boolean
  children: React.ReactNode
}) {
  const [rawSelectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [selectMode, setSelectMode] = React.useState(false)

  // Derive the effective selection as the intersection with the rows currently
  // present, so a filter change or a deleted row never leaves us acting on rows
  // the user can't see. Stale ids are simply ignored rather than mutated away.
  const allIdsKey = allIds.join(",")
  const selectedIds = React.useMemo(() => {
    const present = new Set(allIds)
    return new Set([...rawSelectedIds].filter((id) => present.has(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSelectedIds, allIdsKey])

  const toggle = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = React.useCallback(() => setSelectedIds(new Set()), [])

  const replaceSelection = React.useCallback(
    (ids: string[]) => setSelectedIds(new Set(ids)),
    []
  )

  const allSelected = allIds.length > 0 && selectedIds.size === allIds.length
  const someSelected = selectedIds.size > 0

  const toggleAll = React.useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds))
  }, [allSelected, allIds])

  const value = React.useMemo<BatchSelectionContextValue>(
    () => ({
      enabled,
      allIds,
      selectedIds,
      isSelected: (id) => selectedIds.has(id),
      toggle,
      toggleAll,
      clear,
      replaceSelection,
      allSelected,
      someSelected,
      selectMode,
      setSelectMode,
    }),
    [
      enabled,
      allIds,
      selectedIds,
      toggle,
      toggleAll,
      clear,
      replaceSelection,
      allSelected,
      someSelected,
      selectMode,
    ]
  )

  return (
    <BatchSelectionContext.Provider value={value}>
      {children}
    </BatchSelectionContext.Provider>
  )
}

/**
 * Access batch-selection state. Returns null when rendered outside a provider
 * (e.g. when selection is disabled), so callers can no-op gracefully.
 */
export function useBatchSelection(): BatchSelectionContextValue | null {
  return React.useContext(BatchSelectionContext)
}
