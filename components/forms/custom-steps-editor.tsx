"use client"

import * as React from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconGripVertical, IconListDetails, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { saveCustomFormSteps } from "@/app/(dashboard)/events/form-config-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CustomQuestion, CustomStep } from "@/lib/forms/custom-questions"

function newQuestion(): CustomQuestion {
  return { id: crypto.randomUUID(), label: "", type: "ShortText", required: false, options: [] }
}

function newStep(): CustomStep {
  return { id: crypto.randomUUID(), title: "", questions: [newQuestion()] }
}

function optionDraftsFor(steps: CustomStep[]): Record<string, string> {
  return Object.fromEntries(
    steps.flatMap((step) => step.questions.map((question) => [question.id, question.options.join("\n")])),
  )
}

function normalizeOptions(value: string): string[] {
  return value.split("\n").map((option) => option.trim()).filter(Boolean)
}

function SortableStep({
  step,
  stepIndex,
  children,
  onTitleChange,
  onRemove,
}: {
  step: CustomStep
  stepIndex: number
  children: React.ReactNode
  onTitleChange: (value: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`space-y-4 py-4 first:pt-0 last:pb-0 ${isDragging ? "relative z-10 rounded-md bg-background shadow-md" : ""}`}
      aria-label={`Step ${stepIndex + 1}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={`custom-step-title-${step.id}`}>Step {stepIndex + 1}</Label>
          <Input
            id={`custom-step-title-${step.id}`}
            value={step.title}
            maxLength={100}
            placeholder="Step title"
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 sm:pt-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
            aria-label={`Reorder step ${stepIndex + 1}. Press Space to pick up, use the arrow keys to move, then press Space to drop or Escape to cancel.`}
            title="Drag or press Space to reorder"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`Remove step ${stepIndex + 1}`}
            title="Remove step"
            onClick={onRemove}
          >
            <IconTrash aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      {children}
    </section>
  )
}

function CustomQuestionEditor({
  question,
  index,
  optionsText,
  onChange,
  onOptionsChange,
}: {
  question: CustomQuestion
  index: number
  optionsText: string
  onChange: (patch: Partial<CustomQuestion>) => void
  onOptionsChange: (value: string) => void
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

      <div className="flex items-center gap-2 md:col-span-2">
        <Switch
          id={`${questionId}-required`}
          checked={question.required}
          onCheckedChange={(required) => onChange({ required })}
        />
        <Label htmlFor={`${questionId}-required`}>Required</Label>
      </div>
    </div>
  )
}

export function CustomStepsEditor({
  eventId,
  initial,
}: {
  eventId: string
  initial: CustomStep[]
}) {
  const [steps, setSteps] = React.useState(initial)
  const [savedSteps, setSavedSteps] = React.useState(initial)
  const [optionDrafts, setOptionDrafts] = React.useState(() => optionDraftsFor(initial))
  const [saving, setSaving] = React.useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const currentSteps = steps.map((step) => ({
    ...step,
    questions: step.questions.map((question) => ({
      ...question,
      options: normalizeOptions(optionDrafts[question.id] ?? question.options.join("\n")),
    })),
  }))
  const dirty = JSON.stringify(currentSteps) !== JSON.stringify(savedSteps)

  function updateQuestion(stepIndex: number, questionIndex: number, patch: Partial<CustomQuestion>) {
    setSteps((current) => current.map((step, index) => index !== stepIndex ? step : {
      ...step,
      questions: step.questions.map((question, position) => position === questionIndex ? { ...question, ...patch } : question),
    }))
  }

  function updateStep(stepIndex: number, patch: Partial<CustomStep>) {
    setSteps((current) => current.map((step, index) => index === stepIndex ? { ...step, ...patch } : step))
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveCustomFormSteps(eventId, "Register", currentSteps)
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

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSteps((current) => {
      const from = current.findIndex((step) => step.id === active.id)
      const to = current.findIndex((step) => step.id === over.id)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  return (
    <section className="space-y-4 rounded-lg border px-4 py-4 sm:px-5" aria-labelledby={`custom-steps-title-${eventId}`}>
      <div className="flex items-start gap-3">
        <IconListDetails aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 id={`custom-steps-title-${eventId}`} className="text-sm font-medium">Shared custom steps</h3>
          <p className="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">
            These steps appear on both Register and Walk-in forms. Each step has one question; submitted answers keep the wording used when they were collected.
          </p>
        </div>
      </div>

      {steps.length === 0 ? (
        <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          No custom steps. Add a step to include questions in this form.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
          <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y">
              {steps.map((step, stepIndex) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  stepIndex={stepIndex}
                  onTitleChange={(value) => updateStep(stepIndex, { title: value })}
                  onRemove={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
                >
                  <div className="space-y-4">
                    {step.questions.map((question, questionIndex) => (
                      <CustomQuestionEditor
                        key={question.id}
                        question={question}
                        index={questionIndex}
                        optionsText={optionDrafts[question.id] ?? question.options.join("\n")}
                        onChange={(patch) => updateQuestion(stepIndex, questionIndex, patch)}
                        onOptionsChange={(value) => setOptionDrafts((drafts) => ({ ...drafts, [question.id]: value }))}
                      />
                    ))}
                  </div>
                </SortableStep>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
