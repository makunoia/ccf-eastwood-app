import { Prisma } from "@/app/generated/prisma/client"
import type { BatchDeleteResult } from "@/components/batch/types"

/**
 * A refusal `deleteOne` raises when it can explain the block better than the
 * generic `fkReason` — its message is shown to the user verbatim.
 *
 * A distinct class rather than any `Error`, because the fallback reason exists
 * precisely so that unexpected failures never surface raw error text.
 */
export class BatchDeleteBlocked extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "BatchDeleteBlocked"
  }
}

/**
 * Delete rows one at a time, collecting per-row failures instead of aborting
 * the whole batch (unlike `deleteMany`). Foreign-key violations are reported
 * with a friendly `fkReason` so the user understands why a row was kept.
 */
export async function runBatchDelete(opts: {
  ids: string[]
  /** Map of id → display name, for failure messages. */
  names: Map<string, string>
  deleteOne: (id: string) => Promise<void>
  /** Reason shown when a row can't be deleted due to related records. */
  fkReason: string
}): Promise<BatchDeleteResult> {
  const { ids, names, deleteOne, fkReason } = opts
  let deleted = 0
  const failed: BatchDeleteResult["failed"] = []

  for (const id of ids) {
    try {
      await deleteOne(id)
      deleted++
    } catch (err) {
      const isFk =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2003" || err.code === "P2014")
      failed.push({
        id,
        name: names.get(id) ?? "Unknown",
        reason:
          err instanceof BatchDeleteBlocked
            ? err.message
            : isFk
              ? fkReason
              : "could not be deleted",
      })
    }
  }

  return { deleted, failed }
}
