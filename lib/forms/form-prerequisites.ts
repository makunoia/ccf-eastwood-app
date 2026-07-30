import type { FormContext } from "@/app/generated/prisma/client"
import type { FormToggleKey } from "./context-config"

/**
 * A toggle can be on and still collect nothing, because some sections and fields
 * need data that lives outside the form builder — breakout groups with a
 * facilitator, life stages, age range buckets. Those forms rendered one step
 * short with no explanation on the form or in the builder, which is how the
 * Breakout step went missing from the walk-in form.
 *
 * Client-safe half: the shape and the narrowing rule. The DB reads that produce
 * these live in `form-prerequisites-server.ts`.
 */
export type TogglePrerequisite = {
  message: string
  /**
   * Surfaces the warning applies to. The facilitator gate is a walk-in rule, so
   * warning about it on the Register tab would be wrong. Omit when the gap
   * affects every context.
   */
  contexts?: readonly FormContext[]
}

export type TogglePrerequisites = Partial<Record<FormToggleKey, TogglePrerequisite>>

/** The warning for this toggle on this surface, or null when there is nothing to say. */
export function prerequisiteFor(
  prerequisites: TogglePrerequisites | undefined,
  key: FormToggleKey,
  context: FormContext
): string | null {
  const p = prerequisites?.[key]
  if (!p) return null
  if (p.contexts && !p.contexts.includes(context)) return null
  return p.message
}
