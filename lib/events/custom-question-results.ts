export type CustomAnswerType = "ShortText" | "LongText" | "SingleChoice" | "MultipleChoice"

export type CustomQuestionResult = {
  questionId: string
  title: string
  label: string
  type: CustomAnswerType
  options: string[]
  totalResponses: number
  choiceCounts: Array<{ option: string; count: number }>
  textSamples: string[]
}

export function summarizeCustomQuestion(
  definition: { id: string; title: string; question: { id: string; label: string; type: CustomAnswerType; options: string[] } },
  submissions: Array<{ createdAt: Date; customResponses: unknown }>,
  start: Date | null,
  end: Date,
  sampleLimit = 5
): CustomQuestionResult {
  const counts = new Map(definition.question.options.map((option) => [option, 0]))
  const textAnswers: Array<{ date: Date; answer: string }> = []
  let totalResponses = 0

  for (const submission of submissions) {
    if ((start && submission.createdAt < start) || submission.createdAt > end) continue
    if (!Array.isArray(submission.customResponses)) continue
    const response = submission.customResponses.find((item) =>
      !!item && typeof item === "object" && "questionId" in item && item.questionId === definition.question.id
    ) as { answer?: unknown } | undefined
    if (!response) continue

    const answer = response.answer
    if (typeof answer === "string" && answer.trim()) {
      totalResponses++
      if (definition.question.type === "ShortText" || definition.question.type === "LongText") {
        textAnswers.push({ date: submission.createdAt, answer: answer.trim() })
      } else if (definition.question.type === "SingleChoice" || definition.question.type === "MultipleChoice") {
        if (!counts.has(answer)) counts.set(answer, 0)
        counts.set(answer, (counts.get(answer) ?? 0) + 1)
      }
    } else if (Array.isArray(answer) && answer.length) {
      const valid = [...new Set(answer.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
      if (valid.length) {
        totalResponses++
        for (const option of valid) {
          if (!counts.has(option)) counts.set(option, 0)
          counts.set(option, (counts.get(option) ?? 0) + 1)
        }
      }
    }
  }

  textAnswers.sort((a, b) => b.date.getTime() - a.date.getTime())
  return {
    questionId: definition.question.id,
    title: definition.title,
    label: definition.question.label,
    type: definition.question.type,
    options: [...counts.keys()],
    totalResponses,
    choiceCounts: definition.question.type === "SingleChoice" || definition.question.type === "MultipleChoice"
      ? [...counts.entries()].map(([option, count]) => ({ option, count }))
      : [],
    textSamples: textAnswers.slice(0, sampleLimit).map((item) => item.answer),
  }
}
