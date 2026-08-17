import { describe, expect, it } from "vitest"

import {
  resolveClusterEventSelection,
  validateClusterEventSelection,
} from "@/lib/validations/event-cluster"
import { MINISTRY_REQUIRED_ERROR } from "@/lib/clusters/copy"
import { ClusterKind } from "@/app/generated/prisma/client"

/**
 * Which of a day's events a submission registers for (CCF-148).
 *
 * A Parallel day asks which events you're joining, so any number from one upwards
 * is a legal answer. A Collab day asks which *ministry* you're part of, so exactly
 * one is — and the form sends the event id that ministry names, which is why this
 * function needs no ministry lookup to check the answer.
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
  it("accepts the one event the chosen ministry names", () => {
    expect(resolveClusterEventSelection(ClusterKind.Collab, [SINGLES], DAY)).toEqual({
      ok: true,
      eventIds: [SINGLES],
    })
  })

  it("refuses an empty answer, naming the ministry rather than an event", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, [], DAY)
    expect(result).toEqual({ ok: false, error: MINISTRY_REQUIRED_ERROR })
  })

  it("refuses two — two ministries is not an answer to the question asked", () => {
    // Only reachable from a hand-built payload: the form is single-choice.
    const result = resolveClusterEventSelection(ClusterKind.Collab, DAY, DAY)
    expect(result).toEqual({ ok: false, error: MINISTRY_REQUIRED_ERROR })
  })

  it("collapses a duplicated single answer rather than rejecting it", () => {
    expect(
      resolveClusterEventSelection(ClusterKind.Collab, [YOUTH, YOUTH], DAY)
    ).toEqual({ ok: true, eventIds: [YOUTH] })
  })

  it("refuses an event outside the day", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, ["evt-other"], DAY)
    expect(result.ok).toBe(false)
  })

  it("refuses a collab with no events — there is nothing to register for", () => {
    const result = resolveClusterEventSelection(ClusterKind.Collab, [], [])
    expect(result.ok).toBe(false)
  })

  it("does not alias the caller's array", () => {
    const selected = [YOUTH]
    const result = resolveClusterEventSelection(ClusterKind.Collab, selected, DAY)
    expect(result.ok).toBe(true)
    if (result.ok) {
      result.eventIds.push("mutated")
      expect(selected).toEqual([YOUTH])
    }
  })
})
