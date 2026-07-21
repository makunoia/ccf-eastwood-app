import * as React from "react"
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
import type { WeightKey } from "@/lib/validations/matching-weights"

/**
 * Icon + accent colour for each matching factor. Shared between the Settings
 * priority form and the per-factor breakdown grid so the two never disagree on
 * how a factor looks. Client-only — pulls in `@tabler/icons-react`, so it must
 * not be imported from server code or the zod-only validations module.
 */
export const FIELD_META: Record<
  WeightKey,
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

export type ScoreBand = {
  label: string
  /** Tailwind classes for a small outline badge. */
  className: string
}

/**
 * Maps a factor score + whether it was measured to a labelled band. Keeps the
 * grid's colour language in one place: green strong, neutral good, amber fair,
 * rose weak, muted when we simply have no data to judge on.
 */
export function scoreBand(score: number, known: boolean, isGate = false): ScoreBand {
  if (!known) {
    return { label: "Not enough info", className: "text-muted-foreground border-muted-foreground/30" }
  }
  if (isGate) {
    // Gates that fail are filtered out upstream, so a measured gate is a pass.
    return { label: "Met", className: "text-emerald-600 border-emerald-300" }
  }
  if (score >= 0.9) return { label: "Strong", className: "text-emerald-600 border-emerald-300" }
  if (score >= 0.6) return { label: "Good", className: "text-sky-600 border-sky-300" }
  if (score >= 0.4) return { label: "Fair", className: "text-amber-600 border-amber-300" }
  return { label: "Weak", className: "text-rose-600 border-rose-300" }
}
