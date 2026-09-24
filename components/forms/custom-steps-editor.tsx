"use client"

import * as React from "react"
import { IconArrowDown, IconArrowUp, IconListDetails, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { saveCustomFormSteps } from "@/app/(dashboard)/events/form-config-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CustomQuestion, CustomStep } from "@/lib/forms/custom-questions"
import type { FormContext } from "@/app/generated/prisma/client"

function newQuestion(): CustomQuestion {
  return { id: crypto.randomUUID(), label: "", type: "ShortText", required: false, options: [] }
}

function newStep(): CustomStep {
  return { id: crypto.randomUUID(), title: "", questions: [newQuestion()] }
}

function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const next = [...items]
  const target = index + offset
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function optionDraftsFor(steps: CustomStep[]): Record<string, string> {
  return Object.fromEntries(
    steps.flatMap((step) => step.questions.map((question) => [question.id, question.options.join("\n")])),
  )
}

function normalizeOptions(value: string): string[] {
  return value.split("\n").map((option) => option.trim()).filter(Boolean)
}

function CustomQuestionEditor({
  question,
  index,
  total,
  optionsText,
  onChange,
  onOptionsChange,
  onMove,
  onRemove,
}: {
  question: CustomQuestion
  index: number
  total: number
  optionsText: string
  onChange: (patch: Partial<CustomQuestion>) => void
  onOptionsChange: (value: string) => void
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}) {
  const isChoice = question.type === "SingleChoice" || question.type === "MultipleChoice"
  const questionId = `custom-question-${question.id}`

  return (
    <div className="grid gap-x-4 gap-y-3 border-t pt-4 md:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${questionId}-label`}>Question {index + 1}</Label>
        <Input
          id={`${questionId}-label`}
          value={question.label}
          maxLength={160}
          placeholder="Write your question"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${questionId}-type`}>Answer type</Label>
        <Select
          value={question.type}
          onValueChange={(value) => onChange({ type: value as CustomQuestion["type"] })}
        >
          <SelectTrigger id={`${questionId}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ShortText">Short text</SelectItem>
            <SelectItem value="LongText">Long text</SelectItem>
            <SelectItem value="SingleChoice">Single choice</SelectItem>
            <SelectItem value="MultipleChoice">Multiple choice</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isChoice && (
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${questionId}-options`}>Answer options</Label>
          <Textarea
            id={`${questionId}-options`}
            value={optionsText}
            onChange={(event) => onOptionsChange(event.target.value)}
            placeholder="Enter one option per line"
            rows={3}
            className="min-h-20 resize-y"
          />
          <p className="text-xs text-muted-foreground">Press Enter after each option.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`${questionId}-required`}
            checked={question.required}
            onCheckedChange={(required) => onChange({ required })}
          />
          <Label htmlFor={`${questionId}-required`}>Required</Label>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move question ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <IconArrowUp aria-hidden className="size-4" />
            <span className="sr-only">Move up</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move question ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <IconArrowDown aria-hidden className="size-4" />
            <span className="sr-only">Move down</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <IconTrash aria-hidden className="size-4" />
            Remove question
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CustomStepsEditor({
  eventId,
  context,
  initial,
}: {
  eventId: string
  context: FormContext
  initial: CustomStep[]
}) {
  const [steps, setSteps] = React.useState(initial)
  const [savedSteps, setSavedSteps] = React.useState(initial)
  const [optionDrafts, setOptionDrafts] = React.useState(() => optionDraftsFor(initial))
  const [saving, setSaving] = React.useState(false)

  const currentSteps = steps.map((step) => ({
    ...step,
    questions: step.questions.map((question) => ({
      ...question,
      options: normalizeOptions(optionDrafts[question.id] ?? question.options.join("\n")),
    })),
  }))
  const dirty = JSON.stringify(currentSteps) !== JSON.stringify(savedSteps)

  function updateStep(stepIndex: number, patch: Partial<CustomStep>) {
    setSteps((current) => current.map((step, index) => index === stepIndex ? { ...step, ...patch } : step))
  }

  function updateQuestion(stepIndex: number, questionIndex: number, patch: Partial<CustomQuestion>) {
    setSteps((current) => current.map((step, index) => index !== stepIndex ? step : {
      ...step,
      questions: step.questions.map((question, position) => position === questionIndex ? { ...question, ...patch } : question),
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveCustomFormSteps(eventId, context, currentSteps)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSteps(currentSteps)
      setSavedSteps(currentSteps)
      setOptionDrafts(optionDraftsFor(currentSteps))
      toast.success("Custom steps saved")
    } catch {
      toast.error("Could not save custom steps. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  function cancelChanges() {
    setSteps(savedSteps)
    setOptionDrafts(optionDraftsFor(savedSteps))
  }

  return (
    <section className="space-y-4 rounded-lg border px-4 py-4 sm:px-5" aria-labelledby={`custom-steps-title-${context}`}>
      <div className="flex items-start gap-3">
        <IconListDetails aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 id={`custom-steps-title-${context}`} className="text-sm font-medium">Custom steps</h3>
          <p className="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">
            Add questions to this form. Submitted answers keep the wording used when they were collected.
          </p>
        </div>
      </div>

      {steps.length === 0 ? (
        <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          No custom steps. Add a step to include questions in this form.
        </p>
      ) : (
        <div className="divide-y">
          {steps.map((step, stepIndex) => (
            <section key={step.id} className="space-y-4 py-4 first:pt-0 last:pb-0" aria-label={`Step ${stepIndex + 1}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`custom-step-title-${step.id}`}>Step {stepIndex + 1}</Label>
                  <Input
                    id={`custom-step-title-${step.id}`}
                    value={step.title}
                    maxLength={100}
                    placeholder="Step title"
                    onChange={(event) => updateStep(stepIndex, { title: event.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 sm:pt-5">
                  <Button type="button" variant="ghost" size="sm" disabled={stepIndex === 0} onClick={() => setSteps((current) => moveItem(current, stepIndex, -1))}>Move up</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={stepIndex === steps.length - 1} onClick={() => setSteps((current) => moveItem(current, stepIndex, 1))}>Move down</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSteps((current) => current.filter((_, index) => index !== stepIndex))}>Remove step</Button>
                </div>
              </div>

              <div className="space-y-4">
                {step.questions.map((question, questionIndex) => (
                  <CustomQuestionEditor
                    key={question.id}
                    question={question}
                    index={questionIndex}
                    total={step.questions.length}
                    optionsText={optionDrafts[question.id] ?? question.options.join("\n")}
                    onChange={(patch) => updateQuestion(stepIndex, questionIndex, patch)}
                    onOptionsChange={(value) => setOptionDrafts((drafts) => ({ ...drafts, [question.id]: value }))}
                    onMove={(offset) => updateStep(stepIndex, { questions: moveItem(step.questions, questionIndex, offset) })}
                    onRemove={() => updateStep(stepIndex, { questions: step.questions.filter((_, index) => index !== questionIndex) })}
                  />
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={() => updateStep(stepIndex, { questions: [...step.questions, newQuestion()] })}>
                Add question
              </Button>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setSteps((current) => [...current, newStep()])}>
          Add step
        </Button>
        {dirty && !saving && (
          <Button type="button" variant="ghost" size="sm" onClick={cancelChanges}>Cancel</Button>
        )}
        <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  )
}
