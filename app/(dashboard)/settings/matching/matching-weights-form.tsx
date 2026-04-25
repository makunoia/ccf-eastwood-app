"use client"

import * as React from "react"
import { toast } from "sonner"
import { IconDeviceFloppy } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MatchingContext } from "@/app/generated/prisma/client"
import {
  DEFAULT_WEIGHTS,
  WEIGHT_FIELDS,
  type MatchingWeightsFormValues,
} from "@/lib/validations/matching-weights"
import { upsertMatchingWeights } from "./actions"

type Props = {
  context: MatchingContext
  initial: MatchingWeightsFormValues | null
}

function toStringValues(values: MatchingWeightsFormValues): Record<keyof MatchingWeightsFormValues, string> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, String(v)])
  ) as Record<keyof MatchingWeightsFormValues, string>
}

function computeSum(values: Record<string, string>): number {
  return Object.values(values).reduce((acc, v) => acc + (parseFloat(v) || 0), 0)
}

export function MatchingWeightsForm({ context, initial }: Props) {
  const defaults = initial ?? DEFAULT_WEIGHTS
  const [form, setForm] = React.useState(toStringValues(defaults))
  const [saving, setSaving] = React.useState(false)
  const isFirstRender = React.useRef(true)

  const sum = computeSum(form)
  const sumValid = Math.abs(sum - 1) <= 0.001
  const sumDisplay = sum.toFixed(3)

  function set(field: keyof MatchingWeightsFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Auto-save when sum is valid, debounced 800ms
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!sumValid) return

    const timer = setTimeout(async () => {
      setSaving(true)
      const numeric = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, parseFloat(v) || 0])
      ) as MatchingWeightsFormValues
      const result = await upsertMatchingWeights(context, numeric)
      setSaving(false)
      if (result.success) {
        toast.success("Weights saved")
      } else {
        toast.error(result.error)
      }
    }, 800)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, sumValid])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sumValid) return
    setSaving(true)

    const numeric = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, parseFloat(v) || 0])
    ) as MatchingWeightsFormValues

    const result = await upsertMatchingWeights(context, numeric)
    setSaving(false)

    if (result.success) {
      toast.success("Weights saved")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WEIGHT_FIELDS.map(({ key, label, description }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`${context}-${key}`}>{label}</Label>
            <p className="text-xs text-muted-foreground">{description}</p>
            <Input
              id={`${context}-${key}`}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              className="font-mono"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Total:</span>
          <span
            className={
              sumValid
                ? "font-mono font-semibold text-green-600"
                : "font-mono font-semibold text-destructive"
            }
          >
            {sumDisplay}
          </span>
          {!sumValid && (
            <span className="text-xs text-destructive">
              (must equal 1.000)
            </span>
          )}
        </div>

        <Button type="submit" disabled={saving || !sumValid} size="sm">
          <IconDeviceFloppy className="mr-2 size-4" />
          {saving ? "Saving…" : "Save weights"}
        </Button>
      </div>
    </form>
  )
}
