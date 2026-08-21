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
  /**
   * Show this warning when the toggle is **off** rather than on.
   *
   * Every other prerequisite here explains why something switched on won't
   * appear. Gender is the inverse case: switching it *off* doesn't remove a step,
   * it quietly degrades breakout placement, because a gendered table is never
   * suggested to someone whose gender we don't hold. The admin needs to hear that
   * precisely while the switch is off, which is the one state the builder used to
   * suppress warnings in.
   */
  whenOff?: boolean
}

export type TogglePrerequisites = Partial<Record<FormToggleKey, TogglePrerequisite>>

/**
 * The warning for this toggle on this surface, or null when there is nothing to
 * say.
 *
 * `isOn` is the toggle's current state, and lives here rather than in the JSX so
 * that "which state does this warning belong to?" is one testable rule instead of
 * a condition repeated at three call sites — where it was previously hardcoded to
 * on-only, making a `whenOff` warning impossible to render.
 */
export function prerequisiteFor(
  prerequisites: TogglePrerequisites | undefined,
  key: FormToggleKey,
  context: FormContext,
  isOn: boolean
): string | null {
  const p = prerequisites?.[key]
  if (!p) return null
  if (p.contexts && !p.contexts.includes(context)) return null
  if (!p.whenOff !== isOn) return null
  return p.message
}
