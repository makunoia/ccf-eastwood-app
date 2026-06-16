/** A single row that could not be deleted, with a human-readable reason. */
export type BatchFailure = {
  id: string
  name: string
  reason: string
}

export type BatchDeleteResult = {
  deleted: number
  failed: BatchFailure[]
}

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Server-action signature for a bulk delete. */
export type BatchDeleteFn = (ids: string[]) => Promise<ActionResult<BatchDeleteResult>>

/** Server-action signature for a bulk life-stage update. `null` clears it. */
export type BatchLifeStageFn = (
  ids: string[],
  lifeStageId: string | null
) => Promise<ActionResult<{ updated: number }>>

/** Server-action signature for a bulk status update. */
export type BatchStatusFn = (
  ids: string[],
  status: string
) => Promise<ActionResult<{ updated: number }>>
