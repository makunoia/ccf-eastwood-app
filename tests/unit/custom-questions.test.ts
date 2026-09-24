import { describe, expect, it } from "vitest"
import { customStepsSchema, validateCustomResponses, type CustomStep } from "@/lib/forms/custom-questions"

const steps: CustomStep[] = [{
  id: "about-you",
  title: "About you",
  questions: [
    { id: "name", label: "What should we call you?", type: "ShortText", required: true, options: [] },
    { id: "details", label: "Anything else?", type: "LongText", required: false, options: [] },
    { id: "session", label: "Session", type: "SingleChoice", required: false, options: ["Morning", "Evening"] },
    { id: "interests", label: "Interests", type: "MultipleChoice", required: false, options: ["Music", "Sports"] },
  ],
}]

describe("custom registration responses", () => {
  it("snapshots labels for text and choice answers", () => {
    expect(validateCustomResponses(steps, [
      { questionId: "name", answer: "Juan" },
      { questionId: "details", answer: "A longer note\nwith another line." },
      { questionId: "session", answer: "Morning" },
      { questionId: "interests", answer: ["Music", "Sports"] },
    ], "Register")).toEqual([
      { context: "Register", questionId: "name", label: "What should we call you?", answer: "Juan" },
      { context: "Register", questionId: "details", label: "Anything else?", answer: "A longer note\nwith another line." },
      { context: "Register", questionId: "session", label: "Session", answer: "Morning" },
      { context: "Register", questionId: "interests", label: "Interests", answer: ["Music", "Sports"] },
    ])
  })

  it("rejects missing required answers, unknown questions, and stale options", () => {
    expect(validateCustomResponses(steps, [], "Register")).toBeNull()
    expect(validateCustomResponses(steps, [{ questionId: "other", answer: "x" }], "Register")).toBeNull()
    expect(validateCustomResponses(steps, [
      { questionId: "name", answer: "Juan" },
      { questionId: "session", answer: "Afternoon" },
    ], "Register")).toBeNull()
    expect(validateCustomResponses(steps, [
      { questionId: "name", answer: "Juan" },
      { questionId: "interests", answer: ["Music", "Unknown"] },
    ], "Register")).toBeNull()
    expect(validateCustomResponses(steps, [
      { questionId: "name", answer: "Juan" },
      { questionId: "interests", answer: ["Music", "Music"] },
    ], "Register")).toBeNull()
    expect(validateCustomResponses(steps, [
      { questionId: "name", answer: "   " },
    ], "Register")).toBeNull()
  })

  it("rejects malformed admin definitions", () => {
    expect(customStepsSchema.safeParse([{ id: "s", title: "Step", questions: [] }]).success).toBe(false)
    expect(customStepsSchema.safeParse([
      { ...steps[0], questions: [steps[0].questions[0], { ...steps[0].questions[0] }] },
    ]).success).toBe(false)
  })
})
