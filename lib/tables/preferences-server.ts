import "server-only"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  DEFAULT_TABLE_DENSITY,
  type TablePreference,
} from "@/lib/tables/preferences"

export type TablePreferenceMap = Record<string, TablePreference>

/**
 * Every saved table layout belonging to the signed-in admin, keyed by table.
 *
 * Fetched once per layout rather than once per page. The rows are a handful of
 * short string arrays, so pulling all of them costs less than the round trip
 * each list page would otherwise make — and having them present at first paint
 * is what keeps a table from rendering its default columns for a frame before
 * the saved layout snaps in.
 */
export async function getTablePreferences(): Promise<TablePreferenceMap> {
  const session = await auth()
  if (!session?.user?.id) return {}

  try {
    const rows = await db.userTablePreference.findMany({
      where: { userId: session.user.id },
      select: { tableKey: true, hidden: true, shown: true, order: true, density: true },
    })

    const map: TablePreferenceMap = {}
    for (const row of rows) {
      map[row.tableKey] = {
        hidden: row.hidden,
        shown: row.shown,
        order: row.order,
        density: row.density ?? DEFAULT_TABLE_DENSITY,
      }
    }
    return map
  } catch {
    // A preference is a convenience, never a precondition for seeing the data.
    // If this read fails the tables render their defaults and the screen works.
    return {}
  }
}
