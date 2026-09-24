"use client"

import * as React from "react"
import { IconListDetails } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveCustomFormSteps } from "@/app/(dashboard)/events/form-config-actions"
import type { CustomQuestion, CustomStep } from "@/lib/forms/custom-questions"
import type { FormContext } from "@/app/generated/prisma/client"

function id() { return crypto.randomUUID() }
const newQuestion = (): CustomQuestion => ({ id: id(), label: "", type: "ShortText", required: false, options: [] })
const newStep = (): CustomStep => ({ id: id(), title: "New step", questions: [newQuestion()] })

export function CustomStepsEditor({ eventId, context, initial }: { eventId: string; context: FormContext; initial: CustomStep[] }) {
  const [steps, setSteps] = React.useState(initial)
  const [savedSteps, setSavedSteps] = React.useState(initial)
  const [optionDrafts, setOptionDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(initial.flatMap((step) => step.questions.map((question) => [question.id, question.options.join("\n")]))),
  )
  const [saving, setSaving] = React.useState(false)
  const currentSteps = steps.map((step) => ({
    ...step,
    questions: step.questions.map((question) => ({
      ...question,
      options: (optionDrafts[question.id] ?? question.options.join("\n"))
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean),
    })),
  }))
  const dirty = JSON.stringify(currentSteps) !== JSON.stringify(savedSteps)
  function updateStep(index: number, patch: Partial<CustomStep>) { setSteps((all) => all.map((s, i) => i === index ? { ...s, ...patch } : s)) }
  function updateQuestion(si: number, qi: number, patch: Partial<CustomQuestion>) {
    setSteps((all) => all.map((s, i) => i !== si ? s : { ...s, questions: s.questions.map((q, j) => j === qi ? { ...q, ...patch } : q) }))
  }
  async function save() {
    setSaving(true)
    const normalized = currentSteps
    try {
      const result = await saveCustomFormSteps(eventId, context, normalized)
      if (result.success) {
        setSteps(normalized)
        setSavedSteps(normalized)
        setOptionDrafts(Object.fromEntries(normalized.flatMap((step) => step.questions.map((question) => [question.id, question.options.join("\n")]))))
        toast.success("Custom steps saved")
      }
      else toast.error(result.error)
    } catch {
      toast.error("Could not save custom steps. Please try again.")
    } finally {
      setSaving(false)
    }
  }
  function cancelChanges() {
    setSteps(savedSteps)
    setOptionDrafts(
      Object.fromEntries(
        savedSteps.flatMap((step) =>
          step.questions.map((question) => [question.id, question.options.join("\n")]),
        ),
      ),
    )
  }
  return <section className="space-y-3 rounded-lg border px-4 py-4">
    <div className="flex items-start gap-3">
      <IconListDetails aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Custom steps</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Add questions to this form. Submitted answers keep the question wording from the time they were collected.</p>
      </div>
    </div>
    {steps.map((step, si) => <div key={step.id} className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2"><Input aria-label={`Step ${si + 1} title`} value={step.title} onChange={(e) => updateStep(si, { title: e.target.value })} />
        <Button type="button" variant="outline" disabled={si === 0} onClick={() => setSteps((all) => { const next = [...all]; [next[si - 1], next[si]] = [next[si], next[si - 1]]; return next })}>↑</Button>
        <Button type="button" variant="outline" disabled={si === steps.length - 1} onClick={() => setSteps((all) => { const next = [...all]; [next[si + 1], next[si]] = [next[si], next[si + 1]]; return next })}>↓</Button>
        <Button type="button" variant="ghost" onClick={() => setSteps((all) => all.filter((_, i) => i !== si))}>Remove step</Button>
      </div>
      {step.questions.map((q, qi) => <div key={q.id} className="grid gap-3 border-t pt-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div className="space-y-2"><Label htmlFor={`question-label-${q.id}`}>Question</Label><Input id={`question-label-${q.id}`} value={q.label} onChange={(e) => updateQuestion(si, qi, { label: e.target.value })} />
          {(q.type === "SingleChoice" || q.type === "MultipleChoice") && <div className="space-y-1.5"><Label htmlFor={`question-options-${q.id}`}>Answer options</Label><Textarea id={`question-options-${q.id}`} value={optionDrafts[q.id] ?? q.options.join("\n")} onChange={(e) => setOptionDrafts((drafts) => ({ ...drafts, [q.id]: e.target.value }))} placeholder="One option per line" rows={3} /><p className="text-xs text-muted-foreground">Enter one option per line.</p></div>}
        </div>
        <div className="space-y-3"><Label>Answer type</Label><Select value={q.type} onValueChange={(value) => updateQuestion(si, qi, { type: value as CustomQuestion["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ShortText">Short text</SelectItem><SelectItem value="LongText">Long text</SelectItem><SelectItem value="SingleChoice">Single choice</SelectItem><SelectItem value="MultipleChoice">Multiple choice</SelectItem></SelectContent></Select>
          <label className="flex items-center gap-2 text-sm"><Switch checked={q.required} onCheckedChange={(required) => updateQuestion(si, qi, { required })} /> Required</label>
        </div>
        <div className="flex flex-col"><Button type="button" aria-label={`Move question ${qi + 1} up`} variant="outline" size="sm" disabled={qi === 0} onClick={() => updateStep(si, { questions: (() => { const next = [...step.questions]; [next[qi - 1], next[qi]] = [next[qi], next[qi - 1]]; return next })() })}>↑</Button><Button type="button" aria-label={`Move question ${qi + 1} down`} variant="outline" size="sm" disabled={qi === step.questions.length - 1} onClick={() => updateStep(si, { questions: (() => { const next = [...step.questions]; [next[qi + 1], next[qi]] = [next[qi], next[qi + 1]]; return next })() })}>↓</Button><Button type="button" variant="ghost" onClick={() => updateStep(si, { questions: step.questions.filter((_, i) => i !== qi) })}>Remove</Button></div>
      </div>)}
      <Button type="button" variant="outline" onClick={() => updateStep(si, { questions: [...step.questions, newQuestion()] })}>Add question</Button>
    </div>)}
    <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setSteps((all) => [...all, newStep()])}>Add step</Button>{dirty && !saving && <Button type="button" variant="ghost" size="sm" onClick={cancelChanges}>Cancel</Button>}<Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</Button></div>
  </section>
}
