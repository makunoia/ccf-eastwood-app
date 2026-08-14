"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LedGroup } from "./facilitator-leadership"

/**
 * Which of the facilitator's DGroups receives this breakout group's member
 * requests. Only asked when they lead more than one — with a single DGroup there
 * is nothing to choose.
 *
 * Shared by both edit drawers and the assign-facilitator dialog, which each held
 * their own copy. The copies put the explanation *inside* the `<Label>`, and
 * `Label` is a flex row: the hint became a second column and squeezed
 * "Catch Mech DGroup" onto two crowded lines. The explanation is its own line
 * under the label now, which is also where every other field description in the
 * app sits.
 */
export function CatchMechGroupField({
  id,
  ledGroups,
  value,
  onValueChange,
}: {
  /** Distinct per surface — two drawers can be mounted at once. */
  id: string
  ledGroups: LedGroup[]
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={id}>Catch Mech DGroup</Label>
        <p className="text-xs leading-snug text-muted-foreground">
          Members confirmed in this breakout are requested into this DGroup.
        </p>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select a group…" />
        </SelectTrigger>
        <SelectContent>
          {ledGroups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
