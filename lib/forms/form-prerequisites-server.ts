import "server-only"

import { db } from "@/lib/db"
import { breakoutPickerReadiness } from "@/lib/breakout-suggestion-server"
import type { TogglePrerequisites } from "./form-prerequisites"

/**
 * Warnings for toggles that are on but cannot render for lack of data elsewhere.
 *
 * Every one of these was previously invisible: the builder showed a switch in the
 * "on" position and the form quietly rendered one section or field short. The
 * whole point is that the admin finds out here rather than at the door.
 */

/**
 * Gaps that apply to any form surface, event or cluster, because life stages and
 * age range buckets are global settings rather than per-event data.
 */
async function globalFieldPrerequisites(): Promise<TogglePrerequisites> {
  const [lifeStageCount, ageRangeCount] = await Promise.all([
    db.lifeStage.count(),
    db.ageRangeBucket.count(),
  ])

  const prerequisites: TogglePrerequisites = {}
  if (lifeStageCount === 0) {
    prerequisites.fieldLifeStage = {
      message:
        "No life stages exist yet, so this field is skipped. Add them in Settings → Life Stages.",
    }
  }
  if (ageRangeCount === 0) {
    prerequisites.fieldAgeRange = {
      message:
        "No age ranges exist yet, so this field is skipped. Add them in Settings → Age Ranges.",
    }
  }
  return prerequisites
}

/**
 * The cluster's shared form has no breakout picker of its own (it hardcodes
 * `sectionBreakout: false` and hides the toggle), so only the global gaps apply.
 */
export function clusterFormPrerequisites(): Promise<TogglePrerequisites> {
  return globalFieldPrerequisites()
}

/**
 * An event's form, including the three separate reasons its Breakout step can be
 * enabled and still never appear. They are mutually exclusive and ordered most-
 * to least-decisive, so the admin gets the one thing to fix rather than a list.
 */
export async function eventFormPrerequisites(
  eventId: string,
  autoAssignBreakout: boolean
): Promise<TogglePrerequisites> {
  const [globals, { totalGroups, staffedGroups }] = await Promise.all([
    globalFieldPrerequisites(),
    breakoutPickerReadiness(eventId),
  ])

  const prerequisites: TogglePrerequisites = { ...globals }

  if (autoAssignBreakout) {
    prerequisites.sectionBreakout = {
      message:
        "Auto-assign is on, so people are placed into a breakout group on submit and never see this step. Switch to manual below to let them choose.",
    }
  } else if (totalGroups === 0) {
    prerequisites.sectionBreakout = {
      message:
        "This event has no breakout groups yet, so the step won't appear. Create one in Breakouts.",
    }
  } else if (staffedGroups === 0) {
    // Walk-in only — the public form offers every group regardless of staffing.
    prerequisites.sectionBreakout = {
      message: `Walk-ins only see groups whose facilitator has checked in, and none of the ${totalGroups} breakout group${
        totalGroups === 1 ? " has" : "s have"
      } a facilitator assigned — so this step won't appear at the door. Assign facilitators in Breakouts.`,
      contexts: ["WalkIn"],
    }
  }

  return prerequisites
}
