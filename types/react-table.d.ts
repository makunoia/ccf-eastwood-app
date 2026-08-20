import "@tanstack/react-table"
import type { ColumnWidth } from "@/lib/tables/column-sizing"

/**
 * What every column in the app carries beyond its header and cell.
 *
 * TanStack's `ColumnDef` has no room for "how wide should this be" or "may the
 * admin hide it", and both questions now have one answer per column rather than
 * per screen. Declaring them here means `DataTable` and the column picker read
 * the same source the column author wrote.
 */
declare module "@tanstack/react-table" {
  // The two type parameters are fixed by the interface being augmented; this
  // declaration doesn't need either of them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * The column's name in the picker. Required for anything hideable — a
     * `header` may be JSX (a sort button, an icon) and can't be read as text.
     */
    label?: string
    /** Semantic width token; see `lib/tables/column-sizing.ts`. */
    width?: ColumnWidth
    /**
     * Structural columns the admin may never hide or reorder: the selection
     * checkbox, the identifier link, and the row-actions menu. Hiding the
     * identifier would leave rows with no way into their detail page.
     */
    locked?: boolean
    /**
     * A real column that is off until someone asks for it. Used for fields the
     * record holds but most screens don't need day to day (work city, gender,
     * notes). Distinct from hidden: a new `optIn` column stays off for admins
     * who already have a saved layout, while a new ordinary column appears.
     */
    optIn?: boolean
    /** Right-align the head and cells. For counts and money. */
    align?: "left" | "right"
    /**
     * Opt out of the shared truncation, for cells that lay out their own
     * contents (a stack of two lines, a row of badges).
     */
    noTruncate?: boolean
    /**
     * On a table with `onRowClick`, don't let clicks inside this cell reach the
     * row. For the selection checkbox and the row-actions menu, whose own job
     * is the click.
     */
    stopRowClick?: boolean
  }
}
