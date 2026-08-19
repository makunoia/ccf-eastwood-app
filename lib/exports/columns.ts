import type { CSVCell } from "@/lib/csv-export"
import type { FormToggleKey } from "@/lib/forms/context-config"
import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * The column model every column-picker export is built on.
 *
 * Pure and framework-free: the server uses it to work out which columns a surface
 * actually gathers, the client uses the same registry to render the picker and
 * build the CSV. No Prisma, no Blob — importable by both.
 *
 * Two rules carried over from `lib/forms/registration-responses.ts`, because an
 * export that disagrees with the screen it was launched from would be worse than
 * no export at all:
 *
 * 1. **Union across forms.** We don't record which surface someone came through,
 *    so a field counts as gathered if ANY of a surface's forms collects it. Each
 *    registry decides what "any" means for it, via `isGathered`.
 * 2. **A value is never hidden.** A field whose toggle has since been switched off
 *    still exports when answers exist — it is simply flagged as no longer asked,
 *    so an admin can tell "nobody answered" from "we stopped asking".
 */

export type ExportColumnDef<Row, G extends string> = {
  key: string
  label: string
  group: G
  /** The form toggle that gathers this, or null when nothing gates it. */
  toggle: FormToggleKey | null
  /** An event module that must be on for this column to be gathered. */
  module?: EventModuleType
  /**
   * Offer this column only when some row holds a value, but never flag it.
   *
   * For facts nobody was ever *asked* for — a session's series title, an
   * attendee's nickname carried over from their profile. There is no toggle
   * behind them, so "No longer asked" would be a lie; they are simply absent
   * when the surface has nothing to put in them.
   */
  optional?: boolean
  /**
   * Override the "does any row hold an answer?" test. Booleans render as
   * "Yes"/"No" and so never look empty — without an override they'd count as
   * populated everywhere and be offered on surfaces that never collect them.
   */
  hasData?: (rows: Row[]) => boolean
  value: (row: Row) => CSVCell
}

/** A column offered in the picker, with why it is on offer. */
export type ExportColumnState<G extends string> = {
  key: string
  label: string
  group: G
  /** Always exportable — identity and record metadata, behind no gate. */
  core: boolean
  /** One of the surface's forms (or modules) currently gathers this. */
  collected: boolean
  /** At least one row has an answer. */
  hasData: boolean
}

/** A column is core when nothing gates it — not a form toggle, not a module. */
export function isCoreColumn<Row, G extends string>(
  column: ExportColumnDef<Row, G>
): boolean {
  return column.toggle === null && column.module === undefined && !column.optional
}

function isEmpty(cell: CSVCell): boolean {
  return cell === null || cell === undefined || String(cell).trim() === ""
}

/** Registry order: by group, stable, so the declared order holds within a group. */
export function sortByGroup<Row, G extends string>(
  columns: ExportColumnDef<Row, G>[],
  groups: readonly G[]
): ExportColumnDef<Row, G>[] {
  const order = (group: G) => groups.indexOf(group)
  return [...columns].sort((a, b) => order(a.group) - order(b.group))
}

/**
 * Which columns to offer: the core, plus every gated column that is either still
 * gathered or already has answers. A field that was never asked and holds nothing
 * is left out entirely — an all-blank column is noise, not information.
 *
 * `isGathered` is the surface's own answer to "does a form or module collect
 * this?", which keeps form-config and module knowledge out of here.
 */
export function buildExportColumns<Row, G extends string>(
  columns: ExportColumnDef<Row, G>[],
  rows: Row[],
  isGathered: (column: ExportColumnDef<Row, G>) => boolean
): ExportColumnState<G>[] {
  return columns.flatMap((column): ExportColumnState<G>[] => {
    const hasData = column.hasData
      ? column.hasData(rows)
      : rows.some((row) => !isEmpty(column.value(row)))
    const base = { key: column.key, label: column.label, group: column.group, hasData }

    if (isCoreColumn(column)) {
      return [{ ...base, core: true, collected: true }]
    }
    // Never asked, so never flagged: present when populated, absent otherwise.
    if (column.optional) {
      return hasData ? [{ ...base, core: true, collected: true }] : []
    }
    const collected = isGathered(column)
    if (!collected && !hasData) return []
    return [{ ...base, core: false, collected }]
  })
}

/**
 * The picker's starting state: everything on offer. A column only reaches the
 * picker because it is core, still gathered, or holds answers — so the honest
 * default is "export it all" and let the admin narrow.
 */
export function defaultSelectedColumns(columns: { key: string }[]): string[] {
  return columns.map((c) => c.key)
}

/**
 * Table for the chosen columns. Order always follows the registry, never the
 * order the admin happened to tick the boxes in.
 */
export function buildExportTable<Row, G extends string>(
  columns: ExportColumnDef<Row, G>[],
  rows: Row[],
  selectedKeys: string[]
): { headers: string[]; cells: CSVCell[][] } {
  const selected = new Set(selectedKeys)
  const chosen = columns.filter((c) => selected.has(c.key))
  return {
    headers: chosen.map((c) => c.label),
    cells: rows.map((row) => chosen.map((c) => c.value(row))),
  }
}

// ─── Shared value formatting ─────────────────────────────────────────────────

/** `yyyy-mm-dd hh:mm` in Manila — en-CA for the date, so a spreadsheet sorts it. */
export function formatManilaDateTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
  const time = d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
  return `${date} ${time}`
}

export function yesNo(value: boolean): string {
  return value ? "Yes" : "No"
}
