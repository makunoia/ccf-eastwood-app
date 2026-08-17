import { describe, expect, it } from "vitest"

import {
  resolveClusterEventSelection,
  validateClusterEventSelection,
} from "@/lib/validations/event-cluster"
import { ClusterKind } from "@/app/generated/prisma/client"

/**
 * Which of a day's events a submission registers for (CCF-148).
 *
 * The tests that matter are the Collab ones, and specifically that the submitted
 * selection is *ignored* rather than validated. The client omits the picker, but a
 * payload is a claim — honouring a partial selection would let a crafted request
 * register for one ministry's half of a joint event, which is not a state the
 * product has.
 */

const YOUTH = "evt-youth"
const SINGLES = "evt-singles"
const DAY = [YOUTH, SINGLES]

describe("resolveClusterEventSelection — Parallel", () => {
  it("delegates to the existing validator", () => {
    expect(resolveClusterEventSelection(ClusterKind.Parallel, [YOUTH], DAY)).toEqual(
      validateClusterEventSelection([YOUTH], DAY)
    )
  })

  it("still refuses an empty selection", () => {
    const result = resolveClusterEventSelection(ClusterKind.Parallel, [], DAY)
    expect(result.ok).toBe(false)
  })

  it("still refuses an event outside the day", () => {
    const result = resolveClusterEventSelection(ClusterKind.Parallel, ["evt-other"], DAY)
    expect(result.ok).toBe(false)
  })
})

describe("resolveClusterEventSelection — Collab", () => {
  it("registers for every member event when nothing was submitted", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, [], DAY)
    expect(result).toEqual({ ok: true, eventIds: DAY })
  })

  it("ignores a partial selection rather than honouring it", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, [YOUTH], DAY)
    expect(result).toEqual({ ok: true, eventIds: DAY })
  })

  it("ignores a selection naming an event outside the day", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, ["evt-other"], DAY)
    expect(result).toEqual({ ok: true, eventIds: DAY })
  })

  it("refuses a collab with no events — there is nothing to register for", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, [], [])
    expect(result.ok).toBe(false)
  })

  it("does not alias the cluster's own array", () => {
    const day = [YOUTH, SINGLES]
    const result = resolveClusterEventSelection(ClusterKind.Collab, [], day)
    expect(result.ok).toBe(true)
    if (result.ok) {
      result.eventIds.push("mutated")
      expect(day).toEqual([YOUTH, SINGLES])
    }
  })
})
