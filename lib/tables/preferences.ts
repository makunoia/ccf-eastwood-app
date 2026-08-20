/**
 * Reconciling a saved table layout with the columns that exist *today*.
 *
 * A saved preference is a record of what one admin chose months ago, against a
 * column registry that has since gained and lost columns. Everything delicate
 * about this feature lives here, so it is pure: no React, no Prisma, no DOM.
 *
 * The storage shape is deliberately three lists rather than one `visible` array:
 *
 * - `hidden` — ordinary columns the admin switched **off**. Anything not named
 *   is on, so a column added to the registry next month shows up for everyone
 *   instead of being invisible to every admin who ever opened the picker.
 * - `shown` — `optIn` columns the admin switched **on**. Anything not named is
 *   off, so a new opt-in column stays out of the way, which is the whole point
 *   of marking it opt-in.
 * - `order` — a *partial* order over the movable columns. Ids that no longer
 *   exist are dropped; columns the saved order never knew about are slotted back
 *   where their author declared them.
 *
 * A single `visible: string[]` gets both of the first two cases wrong at once.
 */

export type TableDensityValue = "Compact" | "Comfortable"

export const DEFAULT_TABLE_DENSITY: TableDensityValue = "Comfortable"

/** What the picker needs to know about one column. Derived from `ColumnMeta`. */
export type TableColumnSpec = {
  id: string
  label: string
  /** Never hideable, never movable — selection, identifier, row actions. */
  locked: boolean
  /** Off unless the admin has explicitly turned it on. */
  optIn: boolean
  /**
   * Plumbing rather than content: the selection checkbox, the row-actions "⋯".
   * Always locked, and left out of the picker altogether — listing an unnamed
   * column as "select · Always shown" tells an admin nothing they can act on,
   * and makes the "N of M" count describe something other than what they see.
   */
  structural?: boolean
}

export type TablePreference = {
  hidden: string[]
  shown: string[]
  order: string[]
  density: TableDensityValue
}

export const DEFAULT_TABLE_PREFERENCE: TablePreference = {
  hidden: [],
  shown: [],
  order: [],
  density: DEFAULT_TABLE_DENSITY,
}

export type ResolvedTableColumn = TableColumnSpec & { visible: boolean }

export type ResolvedTableLayout = {
  /** Every column, in display order, each flagged visible or not. */
  columns: ResolvedTableColumn[]
  /** TanStack's `columnVisibility` state. */
  visibility: Record<string, boolean>
  /** TanStack's `columnOrder` state — every column id, in display order. */
  order: string[]
  density: TableDensityValue
  visibleCount: number
  /** Columns the admin could show or hide, i.e. everything not locked. */
  hideableCount: number
}

function isVisible(spec: TableColumnSpec, pref: TablePreference): boolean {
  // A locked column is structural. `hidden` naming one is stale data, not an
  // instruction — honouring it would strand rows with no link to their detail
  // page, or a selection column with no checkbox.
  if (spec.locked) return true
  if (spec.optIn) return pref.shown.includes(spec.id)
  return !pref.hidden.includes(spec.id)
}

/**
 * Merge the saved order into the registry order.
 *
 * Only movable (non-locked) columns take part: the selection checkbox stays
 * first and the actions menu stays last no matter what a saved order claims,
 * because those positions are structural rather than a preference. Movable
 * columns then fill the movable slots in the admin's order, and any column the
 * saved order predates is inserted directly after whichever movable column its
 * author declared it after — so a new "Gender" column lands next to the other
 * profile fields rather than at the far right.
 */
function mergeOrder(specs: TableColumnSpec[], saved: string[]): string[] {
  const movable = specs.filter((s) => !s.locked).map((s) => s.id)
  const movableSet = new Set(movable)

  // Drop ids for columns that no longer exist, and any accidental duplicates.
  const seen = new Set<string>()
  const merged: string[] = []
  for (const id of saved) {
    if (movableSet.has(id) && !seen.has(id)) {
      seen.add(id)
      merged.push(id)
    }
  }

  // Slot in anything the saved order never knew about, at its declared position.
  movable.forEach((id, registryIndex) => {
    if (seen.has(id)) return
    seen.add(id)
    // Walk back to the nearest earlier movable column that survived, and land
    // just after it. No earlier neighbour means this column leads the movables.
    let insertAt = 0
    for (let i = registryIndex - 1; i >= 0; i--) {
      const position = merged.indexOf(movable[i])
      if (position !== -1) {
        insertAt = position + 1
        break
      }
    }
    merged.splice(insertAt, 0, id)
  })

  // Re-lay the full order: locked columns hold their registry slots, movable
  // slots are filled from the merged sequence in turn.
  const queue = [...merged]
  return specs.map((spec) => (spec.locked ? spec.id : (queue.shift() as string)))
}

export function normalizePreference(
  pref: Partial<TablePreference> | null | undefined,
): TablePreference {
  return {
    hidden: pref?.hidden ?? [],
    shown: pref?.shown ?? [],
    order: pref?.order ?? [],
    density: pref?.density ?? DEFAULT_TABLE_DENSITY,
  }
}

export function resolveTableColumns(
  specs: TableColumnSpec[],
  preference?: Partial<TablePreference> | null,
): ResolvedTableLayout {
  const pref = normalizePreference(preference)
  const order = mergeOrder(specs, pref.order)

  const byId = new Map(specs.map((s) => [s.id, s]))
  const columns: ResolvedTableColumn[] = order.flatMap((id) => {
    const spec = byId.get(id)
    return spec ? [{ ...spec, visible: isVisible(spec, pref) }] : []
  })

  const visibility: Record<string, boolean> = {}
  for (const column of columns) visibility[column.id] = column.visible

  return {
    columns,
    visibility,
    order,
    density: pref.density,
    visibleCount: columns.filter((c) => c.visible).length,
    hideableCount: columns.filter((c) => !c.locked).length,
  }
}

/**
 * The preference produced by toggling one column, ready to persist.
 *
 * Expressed as a patch over the *current* preference rather than a rebuild from
 * the resolved layout, so a column the admin has never touched stays absent from
 * both lists and keeps following its registry default.
 */
export function toggleColumn(
  spec: TableColumnSpec,
  visible: boolean,
  preference: TablePreference,
): TablePreference {
  if (spec.locked) return preference
  if (spec.optIn) {
    return {
      ...preference,
      shown: visible
        ? [...new Set([...preference.shown, spec.id])]
        : preference.shown.filter((id) => id !== spec.id),
    }
  }
  return {
    ...preference,
    hidden: visible
      ? preference.hidden.filter((id) => id !== spec.id)
      : [...new Set([...preference.hidden, spec.id])],
  }
}

/** Whether this layout is untouched, for the picker's "modified" pill. */
export function isDefaultLayout(
  specs: TableColumnSpec[],
  preference?: Partial<TablePreference> | null,
): boolean {
  const pref = normalizePreference(preference)
  if (pref.density !== DEFAULT_TABLE_DENSITY) return false

  const ids = new Set(specs.map((s) => s.id))
  // Stale entries for columns that no longer exist don't count as a change —
  // the admin can't see them and shouldn't be nagged by a pill about them.
  if (pref.hidden.some((id) => ids.has(id))) return false
  if (pref.shown.some((id) => ids.has(id))) return false

  const movable = specs.filter((s) => !s.locked).map((s) => s.id)
  const merged = mergeOrder(specs, pref.order).filter((id) => {
    const spec = specs.find((s) => s.id === id)
    return spec ? !spec.locked : false
  })
  return merged.every((id, index) => id === movable[index])
}

/** How many changes the admin has made, for the picker trigger's count pill. */
export function changedColumnCount(
  specs: TableColumnSpec[],
  preference?: Partial<TablePreference> | null,
): number {
  const pref = normalizePreference(preference)
  const ids = new Set(specs.map((s) => s.id))
  return (
    pref.hidden.filter((id) => ids.has(id)).length +
    pref.shown.filter((id) => ids.has(id)).length
  )
}
