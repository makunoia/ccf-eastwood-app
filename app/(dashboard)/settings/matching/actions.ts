"use server"

import { revalidatePath } from "next/cache"
import { MatchingContext } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import {
  matchingWeightsSchema,
  guestCooldownDaysSchema,
  DEFAULT_WEIGHTS,
  ACTIVE_WEIGHT_KEYS,
  type MatchingWeightsFormValues,
} from "@/lib/validations/matching-weights"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function upsertMatchingWeights(
  context: MatchingContext,
  raw: MatchingWeightsFormValues
): Promise<ActionResult> {
  const parsed = matchingWeightsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { lifeStage, gender, language, age, schedule, location, mode, career, capacity } =
    parsed.data

  // Only the active (non-gate) factors carry weight, and the engine normalises
  // by their sum — so the invariant is "at least one active factor is on",
  // not "everything sums to 1".
  const activeSum = ACTIVE_WEIGHT_KEYS.reduce((s, k) => s + parsed.data[k], 0)
  if (activeSum <= 0) {
    return { success: false, error: "At least one matching factor must be turned on" }
  }

  try {
    await db.matchingWeightConfig.upsert({
      where: { context },
      create: { context, lifeStage, gender, language, age, schedule, location, mode, career, capacity },
      update: { lifeStage, gender, language, age, schedule, location, mode, career, capacity },
    })
    revalidatePath("/settings/matching")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save matching weights" }
  }
}

export async function updateGuestCooldownDays(raw: number): Promise<ActionResult> {
  const parsed = guestCooldownDaysSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.matchingWeightConfig.upsert({
      where: { context: MatchingContext.SmallGroup },
      create: { context: MatchingContext.SmallGroup, ...DEFAULT_WEIGHTS, guestCooldownDays: parsed.data },
      update: { guestCooldownDays: parsed.data },
    })
    revalidatePath("/settings/matching")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save cooldown setting" }
  }
}
