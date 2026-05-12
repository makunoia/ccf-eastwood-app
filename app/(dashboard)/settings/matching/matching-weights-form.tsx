"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  IconUsers,
  IconGenderBigender,
  IconLanguage,
  IconCake,
  IconClock,
  IconMapPin,
  IconVideo,
  IconBriefcase,
  IconDoorEnter,
} from "@tabler/icons-react"
import { MatchingContext } from "@/app/generated/prisma/client"
import {
  DEFAULT_WEIGHTS,
  WEIGHT_FIELDS,
  type MatchingWeightsFormValues,
} from "@/lib/validations/matching-weights"
import { upsertMatchingWeights } from "./actions"

// ─── Types ───────────────────────────────────────────────────────────────────

type ImportanceValues = Record<keyof MatchingWeightsFormValues, number>

// ─── Field metadata ───────────────────────────────────────────────────────────

const FIELD_META: Record<
  keyof MatchingWeightsFormValues,
  { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }
> = {
  lifeStage: { icon: IconUsers,          color: "#3b82f6" },
  gender:    { icon: IconGenderBigender, color: "#a855f7" },
  language:  { icon: IconLanguage,       color: "#14b8a6" },
  age:       { icon: IconCake,           color: "#f97316" },
  schedule:  { icon: IconClock,          color: "#22c55e" },
  location:  { icon: IconMapPin,         color: "#f43f5e" },
  mode:      { icon: IconVideo,          color: "#06b6d4" },
  career:    { icon: IconBriefcase,      color: "#eab308" },
  capacity:  { icon: IconDoorEnter,      color: "#94a3b8" },
}

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS: Record<string, { label: string; description: string; values: ImportanceValues }> = {
  balanced: {
    label: "Balanced",
    description: "Slight emphasis on life stage and age",
    values: { lifeStage: 100, gender: 50, language: 50, age: 75, schedule: 75, location: 50, mode: 25, career: 25, capacity: 50 },
  },
  community: {
    label: "Community fit",
    description: "Prioritise who they belong with over logistics",
    values: { lifeStage: 100, gender: 80, language: 100, age: 60, schedule: 40, location: 20, mode: 20, career: 0, capacity: 30 },
  },
  logistics: {
    label: "Schedule & location",
    description: "Prioritise when and where they can meet",
    values: { lifeStage: 40, gender: 30, language: 50, age: 20, schedule: 100, location: 90, mode: 70, career: 0, capacity: 20 },
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weightsToImportance(weights: MatchingWeightsFormValues): ImportanceValues {
  const max = Math.max(...Object.values(weights))
  if (max === 0) return Object.fromEntries(WEIGHT_FIELDS.map(({ key }) => [key, 50])) as ImportanceValues
  return Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, Math.round((v / max) * 100)])
  ) as ImportanceValues
}

function importanceToWeights(importance: ImportanceValues): MatchingWeightsFormValues {
  const total = Object.values(importance).reduce((a, b) => a + b, 0)
  if (total === 0) return DEFAULT_WEIGHTS
  return Object.fromEntries(
    Object.entries(importance).map(([k, v]) => [k, v / total])
  ) as MatchingWeightsFormValues
}

function getPct(importance: ImportanceValues, key: keyof MatchingWeightsFormValues): number {
  const total = Object.values(importance).reduce((a, b) => a + b, 0)
  return total === 0 ? 0 : (importance[key] / total) * 100
}

function detectPreset(importance: ImportanceValues): string | null {
  for (const [id, preset] of Object.entries(PRESETS)) {
    if (WEIGHT_FIELDS.every(({ key }) => importance[key] === preset.values[key])) return id
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

  function setField(key: keyof MatchingWeightsFormValues, value: number) {
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
          {WEIGHT_FIELDS.map(({ key }) => {
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
          {WEIGHT_FIELDS.filter(({ key }) => getPct(values, key) >= 0.5).map(({ key, label }) => (
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
        {WEIGHT_FIELDS.map(({ key, label, description }) => {
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
