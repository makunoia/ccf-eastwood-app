import "server-only"

import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"

/**
 * Is the person on the other end of this request signed-in event staff?
 *
 * The walk-in form is a *public* route — it sits in `PUBLIC_PATTERNS` because
 * the door needs a link it can open on any device without a login. "Staffed" is
 * therefore a statement about who is *meant* to use it, not about who *can*.
 * Anything that must not reach a stranger with the URL has to ask this question
 * rather than infer it from the surface.
 *
 * Two things hang off it (CCF-141):
 *  - breakout headcounts render on the walk-in picker
 *  - an explicit pick may deliberately exceed a group's member limit
 *
 * Read permission on Events is the right bar, not merely "has a session": a
 * Volunteers-only staff account has no business reading event breakout rosters.
 *
 * Never throws. An auth failure on a public page must degrade to "not staff"
 * and render the anonymous view, not 500 a registrant out of the form.
 */
export async function isEventStaffViewer(): Promise<boolean> {
  try {
    return canRead(await auth(), "Events")
  } catch {
    return false
  }
}
