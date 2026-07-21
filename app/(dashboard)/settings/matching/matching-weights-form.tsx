"use client"

import * as React from "react"
import { toast } from "sonner"
import { IconLock } from "@tabler/icons-react"
import { MatchingContext } from "@/app/generated/prisma/client"
import {
  DEFAULT_WEIGHTS,
  ACTIVE_WEIGHT_FIELDS,
  ACTIVE_WEIGHT_KEYS,
  GATE_FIELDS,
  type ActiveWeightKey,
  type MatchingWeightsFormValues,
} from "@/lib/validations/matching-weights"
import { FIELD_META } from "@/components/matching/factor-meta"
import { upsertMatchingWeights } from "./actions"

// ─── Types ───────────────────────────────────────────────────────────────────

type ImportanceValues = Record<ActiveWeightKey, number>

// ─── Presets ─────────────────────────────────────────────────────────────────
// 0–100 "importance" per active factor. Life stage, gender and schedule are
// hard requirements, not weighted factors, so they never appear here.

const PRESETS: Record<string, { label: string; description: string; values: ImportanceValues }> = {
  balanced: {
    label: "Balanced",
    description: "A little weight on everything, leaning on age and language",
    values: { language: 75, age: 100, location: 50, mode: 40, career: 40, capacity: 60 },
  },
  community: {
    label: "Community fit",
    description: "Prioritise who they belong with over logistics",
    values: { language: 100, age: 80, location: 20, mode: 20, career: 60, capacity: 40 },
  },
  logistics: {
    label: "Location & availability",
    description: "Prioritise where they can meet and which groups have room",
    values: { language: 50, age: 30, location: 100, mode: 80, career: 0, capacity: 90 },
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weightsToImportance(weights: MatchingWeightsFormValues): ImportanceValues {
  const activeMax = Math.max(...ACTIVE_WEIGHT_KEYS.map((k) => weights[k]))
  if (activeMax === 0) {
    return Object.fromEntries(ACTIVE_WEIGHT_KEYS.map((k) => [k, 50])) as ImportanceValues
  }
  return Object.fromEntries(
    ACTIVE_WEIGHT_KEYS.map((k) => [k, Math.round((weights[k] / activeMax) * 100)])
  ) as ImportanceValues
}

function importanceToWeights(importance: ImportanceValues): MatchingWeightsFormValues {
  const total = ACTIVE_WEIGHT_KEYS.reduce((s, k) => s + importance[k], 0)
  const active =
    total === 0
      ? Object.fromEntries(ACTIVE_WEIGHT_KEYS.map((k) => [k, DEFAULT_WEIGHTS[k]]))
      : Object.fromEntries(ACTIVE_WEIGHT_KEYS.map((k) => [k, importance[k] / total]))
  // Gate factors always persist as 0 — they carry no weight.
  return { lifeStage: 0, gender: 0, schedule: 0, ...active } as MatchingWeightsFormValues
}

function getPct(importance: ImportanceValues, key: ActiveWeightKey): number {
  const total = ACTIVE_WEIGHT_KEYS.reduce((s, k) => s + importance[k], 0)
  return total === 0 ? 0 : (importance[key] / total) * 100
}

function detectPreset(importance: ImportanceValues): string | null {
  for (const [id, preset] of Object.entries(PRESETS)) {
    if (ACTIVE_WEIGHT_KEYS.every((k) => importance[k] === preset.values[k])) return id
  }
  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = { context: MatchingContext; initial: MatchingWeightsFormValues | null }

export function MatchingWeightsForm({ context, initial }: Props) {
  const [values, setValues] = React.useState<ImportanceValues>(
    weightsToImportance(initial ?? DEFAULT_WEIGHTS)
  )
  const [saving, setSaving] = React.useState(false)
  const isFirst = React.useRef(true)

  const activePreset = detectPreset(values)

  function setField(key: ActiveWeightKey, value: number) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  React.useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    const t = setTimeout(async () => {
      setSaving(true)
      const result = await upsertMatchingWeights(context, importanceToWeights(values))
      setSaving(false)
      if (result.success) toast.success("Priorities saved")
      else toast.error(result.error)
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])

  return (
    <div className="space-y-6">

      {/* Requirements — hard gates, shown for context, not tunable */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Always required
        </p>
        <div className="divide-y rounded-lg border bg-muted/30">
          {GATE_FIELDS.map(({ key, label, description }) => {
            const { icon: Icon, color } = FIELD_META[key]
            return (
              <div key={key} className="flex items-center gap-4 px-4 py-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Icon className="size-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{description}</p>
                </div>
                <IconLock className="size-4 shrink-0 text-muted-foreground" />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          These are pass/fail — a group that doesn&apos;t match is never suggested, so
          there&apos;s nothing to weight.
        </p>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Starting points
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              onClick={() => setValues({ ...preset.values })}
              title={preset.description}
              className={[
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                activePreset === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted text-foreground",
              ].join(" ")}
            >
              {preset.label}
            </button>
          ))}
          {!activePreset && (
            <span className="rounded-full border border-dashed border-muted-foreground/40 px-3.5 py-1.5 text-sm text-muted-foreground">
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Distribution bar */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Priority breakdown
        </p>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {ACTIVE_WEIGHT_FIELDS.map(({ key }) => {
            const pct = getPct(values, key)
            if (pct < 0.5) return null
            return (
              <div
                key={key}
                className="transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: FIELD_META[key].color }}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ACTIVE_WEIGHT_FIELDS.filter(({ key }) => getPct(values, key) >= 0.5).map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: FIELD_META[key].color }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Factor rows */}
      <div className="divide-y rounded-lg border">
        {ACTIVE_WEIGHT_FIELDS.map(({ key, label, description }) => {
          const { icon: Icon, color } = FIELD_META[key]
          const pct = getPct(values, key)
          const isOff = values[key] === 0

          return (
            <div key={key} className="flex items-center gap-4 px-4 py-3.5">

              {/* Icon */}
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: isOff ? undefined : `${color}18` }}
              >
                <Icon
                  className="size-4 transition-colors"
                  style={{ color: isOff ? "hsl(var(--muted-foreground))" : color }}
                />
              </div>

              {/* Label */}
              <div className="w-40 shrink-0">
                <p className={["text-sm font-medium leading-snug", isOff ? "text-muted-foreground" : ""].join(" ")}>
                  {label}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">{description}</p>
              </div>

              {/* Slider */}
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <span className="hidden text-xs text-muted-foreground sm:block shrink-0">Less</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={values[key]}
                  onChange={(e) => setField(key, Number(e.target.value))}
                  className="h-1.5 w-full flex-1 cursor-pointer"
                  style={{ accentColor: isOff ? "hsl(var(--muted-foreground))" : color }}
                />
                <span className="hidden text-xs text-muted-foreground sm:block shrink-0">More</span>
              </div>

              {/* Percentage badge */}
              <div
                className="w-10 shrink-0 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums transition-colors"
                style={
                  isOff
                    ? { color: "hsl(var(--muted-foreground))" }
                    : { backgroundColor: `${color}18`, color }
                }
              >
                {isOff ? "off" : `${Math.round(pct)}%`}
              </div>

            </div>
          )
        })}
      </div>

      {/* Status */}
      <p className="text-xs text-muted-foreground">
        {saving ? "Saving…" : "Changes are saved automatically."}
      </p>

    </div>
  )
}
