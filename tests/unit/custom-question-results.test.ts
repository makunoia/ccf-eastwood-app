import { describe, expect, it } from "vitest"
import { summarizeCustomQuestion } from "@/lib/events/custom-question-results"

const end = new Date("2026-09-25T23:59:59.999Z")

describe("custom question dashboard summaries", () => {
  it("pools matching Register and Walk-in snapshots and summarizes choice counts", () => {
    const result = summarizeCustomQuestion({
      id: "step",
      title: "Session",
      question: { id: "q", label: "Which session?", type: "SingleChoice", options: ["Morning", "Evening"] },
    }, [
      { createdAt: new Date("2026-09-25T10:00:00Z"), customResponses: [{ context: "Register", questionId: "q", answer: "Morning" }] },
      { createdAt: new Date("2026-09-25T11:00:00Z"), customResponses: [{ context: "WalkIn", questionId: "q", answer: "Evening" }] },
    ], null, end)

    expect(result.totalResponses).toBe(2)
    expect(result.choiceCounts).toEqual([{ option: "Morning", count: 1 }, { option: "Evening", count: 1 }])
  })

  it("counts multiple selections and limits recent text samples within the selected date range", () => {
    const result = summarizeCustomQuestion({
      id: "step",
      title: "Interests",
      question: { id: "q", label: "What interests you?", type: "MultipleChoice", options: ["Music", "Sports"] },
    }, [
      { createdAt: new Date("2026-09-24T10:00:00Z"), customResponses: [{ questionId: "q", answer: ["Music", "Sports"] }] },
      { createdAt: new Date("2026-09-25T10:00:00Z"), customResponses: [{ questionId: "q", answer: ["Music"] }] },
    ], new Date("2026-09-25T00:00:00Z"), end)

    expect(result.totalResponses).toBe(1)
    expect(result.choiceCounts).toEqual([{ option: "Music", count: 1 }, { option: "Sports", count: 0 }])

    const text = summarizeCustomQuestion({
      id: "text-step", title: "Notes",
      question: { id: "text-q", label: "Tell us more", type: "LongText", options: [] },
    }, Array.from({ length: 7 }, (_, index) => ({
      createdAt: new Date(`2026-09-25T${String(index + 1).padStart(2, "0")}:00:00Z`),
      customResponses: [{ questionId: "text-q", answer: `Answer ${index + 1}` }],
    })), null, end, 5)
    expect(text.totalResponses).toBe(7)
    expect(text.textSamples).toHaveLength(5)
    expect(text.textSamples[0]).toBe("Answer 7")
  })

  it("keeps historical choice values when an option was removed from the active definition", () => {
    const result = summarizeCustomQuestion({
      id: "step", title: "Session",
      question: { id: "q", label: "Which session?", type: "SingleChoice", options: ["Current option"] },
    }, [
      { createdAt: new Date("2026-09-25T10:00:00Z"), customResponses: [{ questionId: "q", answer: "Removed option" }] },
    ], null, end)

    expect(result.totalResponses).toBe(1)
    expect(result.choiceCounts).toEqual([
      { option: "Current option", count: 0 },
      { option: "Removed option", count: 1 },
    ])
  })
})
