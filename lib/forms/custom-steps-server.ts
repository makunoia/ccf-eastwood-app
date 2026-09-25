import "server-only"

import { db } from "@/lib/db"
import { customStepsSchema, type CustomStep } from "./custom-questions"

/** Shared custom questions used by both the Register and Walk-in forms. */
export async function getEventCustomSteps(eventId: string): Promise<CustomStep[]> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { customRegistrationSteps: true },
  })
  const parsed = customStepsSchema.safeParse(event?.customRegistrationSteps ?? [])
  return parsed.success ? parsed.data : []
}
