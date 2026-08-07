/**
 * The registration wizard derives its section list from config and from answers
 * given along the way, so the list can shrink under a step the person has already
 * passed — confirming as a member who already has a DGroup drops the DGroup step,
 * and the breakout/family sections come and go with their toggles.
 *
 * Reading `sections[formStep - 1]` unclamped throws during render and takes the
 * whole form down with it, so every read goes through here.
 */
export function clampFormStep(step: number, sectionCount: number): number {
  if (sectionCount < 1) return 1
  if (Number.isNaN(step)) return 1
  return Math.min(Math.max(Math.trunc(step), 1), sectionCount)
}
