"use client"

import * as React from "react"
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
  const [saving, setSaving] = React.useState(false)
  function updateStep(index: number, patch: Partial<CustomStep>) { setSteps((all) => all.map((s, i) => i === index ? { ...s, ...patch } : s)) }
  function updateQuestion(si: number, qi: number, patch: Partial<CustomQuestion>) {
    setSteps((all) => all.map((s, i) => i !== si ? s : { ...s, questions: s.questions.map((q, j) => j === qi ? { ...q, ...patch } : q) }))
  }
  async function save() {
    setSaving(true)
    try {
      const result = await saveCustomFormSteps(eventId, context, steps)
      if (result.success) toast.success("Custom steps saved")
      else toast.error(result.error)
    } catch {
      toast.error("Could not save custom steps. Please try again.")
    } finally {
      setSaving(false)
    }
  }
  return <section className="max-w-3xl space-y-4 rounded-lg border p-5">
    <div><h3 className="font-semibold">Custom steps</h3><p className="text-sm text-muted-foreground">Add questions to this form. Answers already submitted keep their original question labels.</p></div>
    {steps.map((step, si) => <div key={step.id} className="space-y-4 rounded-md border p-4">
      <div className="flex items-center gap-2"><Input aria-label={`Step ${si + 1} title`} value={step.title} onChange={(e) => updateStep(si, { title: e.target.value })} />
        <Button type="button" variant="outline" disabled={si === 0} onClick={() => setSteps((all) => { const next = [...all]; [next[si - 1], next[si]] = [next[si], next[si - 1]]; return next })}>↑</Button>
        <Button type="button" variant="outline" disabled={si === steps.length - 1} onClick={() => setSteps((all) => { const next = [...all]; [next[si + 1], next[si]] = [next[si], next[si + 1]]; return next })}>↓</Button>
        <Button type="button" variant="ghost" onClick={() => setSteps((all) => all.filter((_, i) => i !== si))}>Remove step</Button>
      </div>
      {step.questions.map((q, qi) => <div key={q.id} className="grid gap-3 rounded-md bg-muted/30 p-3 md:grid-cols-[1fr_170px_auto]">
        <div className="space-y-2"><Label htmlFor={`question-label-${q.id}`}>Question</Label><Input id={`question-label-${q.id}`} value={q.label} onChange={(e) => updateQuestion(si, qi, { label: e.target.value })} />
          {(q.type === "SingleChoice" || q.type === "MultipleChoice") && <div><Label htmlFor={`question-options-${q.id}`}>Answer options (one per line)</Label><Textarea id={`question-options-${q.id}`} value={q.options.join("\n")} onChange={(e) => updateQuestion(si, qi, { options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} /></div>}
        </div>
        <div className="space-y-3"><Label>Answer type</Label><Select value={q.type} onValueChange={(value) => updateQuestion(si, qi, { type: value as CustomQuestion["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ShortText">Short text</SelectItem><SelectItem value="LongText">Long text</SelectItem><SelectItem value="SingleChoice">Single choice</SelectItem><SelectItem value="MultipleChoice">Multiple choice</SelectItem></SelectContent></Select>
          <label className="flex items-center gap-2 text-sm"><Switch checked={q.required} onCheckedChange={(required) => updateQuestion(si, qi, { required })} /> Required</label>
        </div>
        <div className="flex flex-col"><Button type="button" aria-label={`Move question ${qi + 1} up`} variant="outline" size="sm" disabled={qi === 0} onClick={() => updateStep(si, { questions: (() => { const next = [...step.questions]; [next[qi - 1], next[qi]] = [next[qi], next[qi - 1]]; return next })() })}>↑</Button><Button type="button" aria-label={`Move question ${qi + 1} down`} variant="outline" size="sm" disabled={qi === step.questions.length - 1} onClick={() => updateStep(si, { questions: (() => { const next = [...step.questions]; [next[qi + 1], next[qi]] = [next[qi], next[qi + 1]]; return next })() })}>↓</Button><Button type="button" variant="ghost" onClick={() => updateStep(si, { questions: step.questions.filter((_, i) => i !== qi) })}>Remove</Button></div>
      </div>)}
      <Button type="button" variant="outline" onClick={() => updateStep(si, { questions: [...step.questions, newQuestion()] })}>Add question</Button>
    </div>)}
    <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSteps((all) => [...all, newStep()])}>Add step</Button><Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save custom steps"}</Button></div>
  </section>
}
