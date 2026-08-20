"use client"

import * as React from "react"

import { saveTablePreference, resetTablePreference } from "@/lib/tables/actions"
import {
  DEFAULT_TABLE_PREFERENCE,
  normalizePreference,
  type TablePreference,
} from "@/lib/tables/preferences"

type PreferenceMap = Record<string, TablePreference>

type ContextValue = {
  get: (tableKey: string) => TablePreference
  set: (tableKey: string, preference: TablePreference) => void
  reset: (tableKey: string) => void
}

const TablePreferencesContext = React.createContext<ContextValue | null>(null)

/**
 * Holds every table layout the signed-in admin has saved, seeded server-side.
 *
 * Writes are optimistic and un-awaited: ticking a column is a preference, not a
 * transaction, and making the checkbox wait on a round trip would make the
 * picker feel broken. A failed save leaves the session's layout as chosen and
 * quietly falls back to the stored one on the next full load — there is nothing
 * here worth interrupting an admin with a toast about.
 */
export function TablePreferencesProvider({
  initial,
  children,
}: {
  initial: PreferenceMap
  children: React.ReactNode
}) {
  const [preferences, setPreferences] = React.useState<PreferenceMap>(initial)

  const value = React.useMemo<ContextValue>(
    () => ({
      get: (tableKey) => preferences[tableKey] ?? DEFAULT_TABLE_PREFERENCE,
      set: (tableKey, preference) => {
        const next = normalizePreference(preference)
        setPreferences((prev) => ({ ...prev, [tableKey]: next }))
        void saveTablePreference(tableKey, next)
      },
      reset: (tableKey) => {
        setPreferences((prev) => {
          const next = { ...prev }
          delete next[tableKey]
          return next
        })
        void resetTablePreference(tableKey)
      },
    }),
    [preferences],
  )

  return (
    <TablePreferencesContext.Provider value={value}>
      {children}
    </TablePreferencesContext.Provider>
  )
}

/**
 * The saved layout for one table, plus the two writers.
 *
 * Usable outside the provider — a table rendered on a page that has no provider
 * above it (a public surface, a test) simply gets defaults and in-memory edits
 * rather than crashing.
 */
export function useTablePreference(tableKey: string): {
  preference: TablePreference
  setPreference: (preference: TablePreference) => void
  resetPreference: () => void
} {
  const context = React.useContext(TablePreferencesContext)
  const [local, setLocal] = React.useState<TablePreference>(DEFAULT_TABLE_PREFERENCE)

  if (!context) {
    return {
      preference: local,
      setPreference: setLocal,
      resetPreference: () => setLocal(DEFAULT_TABLE_PREFERENCE),
    }
  }

  return {
    preference: context.get(tableKey),
    setPreference: (preference) => context.set(tableKey, preference),
    resetPreference: () => context.reset(tableKey),
  }
}
