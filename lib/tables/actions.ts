"use server"

import { z } from "zod"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { type TablePreference } from "@/lib/tables/preferences"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * A table layout is scoped to the caller and to nothing else — there is no
 * `userId` in the input, because the only layout anyone may write is their own.
 * Column ids are app-defined slugs, so they are length-capped rather than
 * checked against a registry: the server has no view of which columns a given
 * screen offers, and `resolveTableColumns` already discards ids it doesn't
 * recognise at read time.
 */
const columnIds = z.array(z.string().min(1).max(120)).max(200)

const preferenceSchema = z.object({
  tableKey: z.string().min(1).max(120),
  hidden: columnIds,
  shown: columnIds,
  order: columnIds,
  density: z.enum(["Compact", "Comfortable"]),
})

export async function saveTablePreference(
  tableKey: string,
  preference: TablePreference,
): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated." }

  const parsed = preferenceSchema.safeParse({ tableKey, ...preference })
  if (!parsed.success) return { success: false, error: "Invalid table layout." }

  const { tableKey: key, ...data } = parsed.data

  try {
    await db.userTablePreference.upsert({
      where: { userId_tableKey: { userId: session.user.id, tableKey: key } },
      create: { userId: session.user.id, tableKey: key, ...data },
      update: data,
    })
    return { success: true, data: null }
  } catch {
    return { success: false, error: "Could not save your column layout." }
  }
}

/** Drop a saved layout entirely, so the table falls back to its defaults. */
export async function resetTablePreference(tableKey: string): Promise<ActionResult<null>> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated." }

  try {
    await db.userTablePreference.deleteMany({
      where: { userId: session.user.id, tableKey },
    })
    return { success: true, data: null }
  } catch {
    return { success: false, error: "Could not reset your column layout." }
  }
}
