import { describe, it, expect } from "vitest"
import { combineCoupleScores } from "@/lib/matching/engine"

describe("combineCoupleScores", () => {
  it("uses worst-of (min) as the combined score", () => {
    const result = combineCoupleScores(0.9, 0.4)
    expect(result.combinedScore).toBe(0.4)
    expect(result.scoreA).toBe(0.9)
    expect(result.scoreB).toBe(0.4)
  })

  it("is symmetric", () => {
    expect(combineCoupleScores(0.3, 0.8).combinedScore).toBe(
      combineCoupleScores(0.8, 0.3).combinedScore
    )
  })

  it("computes the average as a tie-breaker", () => {
    // Same min, different averages — the higher average should win a tie
    const balanced = combineCoupleScores(0.5, 0.9)
    const lopsided = combineCoupleScores(0.5, 0.6)
    expect(balanced.combinedScore).toBe(lopsided.combinedScore)
    expect(balanced.averageScore).toBeGreaterThan(lopsided.averageScore)
  })

  it("handles equal and boundary scores", () => {
    expect(combineCoupleScores(0.7, 0.7)).toEqual({
      combinedScore: 0.7,
      averageScore: 0.7,
      scoreA: 0.7,
      scoreB: 0.7,
    })
    expect(combineCoupleScores(0, 1).combinedScore).toBe(0)
    expect(combineCoupleScores(1, 1).combinedScore).toBe(1)
  })
})
