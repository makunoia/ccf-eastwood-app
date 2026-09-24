import { z } from "zod"
import type { FormContext } from "@/app/generated/prisma/client"

export const customQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["ShortText", "LongText", "SingleChoice", "MultipleChoice"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(30),
}).superRefine((question, ctx) => {
  if ((question.type === "SingleChoice" || question.type === "MultipleChoice") && question.options.length === 0) {
    ctx.addIssue({ code: "custom", message: "Add at least one answer option to choice questions.", path: ["options"] })
  }
  if (new Set(question.options).size !== question.options.length) {
    ctx.addIssue({ code: "custom", message: "Answer options must be unique.", path: ["options"] })
  }
})
export const customStepSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  questions: z.array(customQuestionSchema).min(1, "Add at least one question to each step.").max(30),
})
export const customStepsSchema = z.array(customStepSchema).max(12).superRefine((steps, ctx) => {
  const stepIds = new Set<string>()
  const questionIds = new Set<string>()
  steps.forEach((step, stepIndex) => {
    if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", message: "Step IDs must be unique.", path: [stepIndex, "id"] })
    stepIds.add(step.id)
    step.questions.forEach((question, questionIndex) => {
      if (questionIds.has(question.id)) ctx.addIssue({ code: "custom", message: "Question IDs must be unique.", path: [stepIndex, "questions", questionIndex, "id"] })
      questionIds.add(question.id)
    })
  })
})
export type CustomQuestion = z.infer<typeof customQuestionSchema>
export type CustomStep = z.infer<typeof customStepSchema>
export type CustomResponse = { context: Extract<FormContext, "Register" | "WalkIn">; questionId: string; label: string; answer: string | string[] }

export function validateCustomResponses(steps: CustomStep[], value: unknown, context: CustomResponse["context"]): CustomResponse[] | null {
  if (!Array.isArray(value)) return null
  const answers = new Map<string, unknown>()
  for (const row of value) {
    if (!row || typeof row !== "object" || !("questionId" in row) || !("answer" in row)) return null
    const item = row as { questionId: unknown; answer: unknown }
    if (typeof item.questionId !== "string" || answers.has(item.questionId)) return null
    answers.set(item.questionId, item.answer)
  }
  const questions = steps.flatMap((step) => step.questions)
  if ([...answers.keys()].some((id) => !questions.some((q) => q.id === id))) return null
  const result: CustomResponse[] = []
  for (const q of questions) {
    const answer = answers.get(q.id)
    const empty = answer == null || (typeof answer === "string" && answer.trim() === "") || (Array.isArray(answer) && answer.length === 0)
    if (q.required && empty) return null
    if (empty) continue
    if (q.type === "ShortText" || q.type === "LongText") {
      if (typeof answer !== "string" || answer.length > 4000) return null
    } else if (q.type === "SingleChoice") {
      if (typeof answer !== "string" || !q.options.includes(answer)) return null
    } else if (!Array.isArray(answer) || answer.length > q.options.length || new Set(answer).size !== answer.length || answer.some((v) => typeof v !== "string" || !q.options.includes(v))) return null
    result.push({ context, questionId: q.id, label: q.label, answer: answer as string | string[] })
  }
  return result
}
