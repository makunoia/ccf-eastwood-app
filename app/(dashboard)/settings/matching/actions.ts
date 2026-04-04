"use server"

import { revalidatePath } from "next/cache"
import { MatchingContext } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import {
  matchingWeightsSchema,
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

  const sum = lifeStage + gender + language + age + schedule + location + mode + career + capacity
  if (Math.abs(sum - 1) > 0.001) {
    return { success: false, error: "Weights must sum to 1.00" }
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
