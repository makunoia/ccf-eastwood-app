"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { submitCatchMechVolunteerPlacements } from "../actions"

export type Participant = {
  id: string
  name: string
  kind: "Guest" | "Member"
}

type SmallGroup = {
  id: string
  name: string
}

type Props = {
  token: string
  volunteerName: string
  participants: Participant[]
  groups: SmallGroup[]
}

export function VolunteerPlacementForm({
  token,
  volunteerName,
  participants,
  groups,
}: Props) {
  const [selected, setSelected] = React.useState<Record<string, boolean>>({})
  const [destinations, setDestinations] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [completedCount, setCompletedCount] = React.useState<number | null>(null)

  const selectedParticipants = participants.filter((participant) => selected[participant.id])

  if (completedCount !== null) {
    return (
      <div className="space-y-2 py-3 text-center">
        <h1 className="text-xl font-semibold">Thank you, {volunteerName}</h1>
        <p className="text-sm text-muted-foreground">
          {completedCount === 0
            ? "Your response has been recorded."
            : `${completedCount} participant${completedCount === 1 ? "" : "s"} joined your DGroup.`}
        </p>
      </div>
    )
  }

  if (participants.length === 0) {
    return (
      <div className="space-y-3 py-3 text-center">
        <h1 className="text-xl font-semibold">Everyone is already connected</h1>
        <p className="text-sm text-muted-foreground">
          There are no event participants waiting to join a DGroup.
        </p>
      </div>
    )
  }

  async function handleSubmit() {
    if (groups.length === 0 && selectedParticipants.length > 0) {
      setError("You need to lead a DGroup before placing participants.")
      return
    }
    if (selectedParticipants.some((participant) => !destinations[participant.id])) {
      setError("Choose a DGroup for every selected participant")
      return
    }

    setError("")
    setSubmitting(true)
    const result = await submitCatchMechVolunteerPlacements(
      token,
      selectedParticipants.map((participant) => ({
        registrantId: participant.id,
        smallGroupId: destinations[participant.id],
      }))
    )
    setSubmitting(false)

    if (result.success) {
      setCompletedCount(result.data.placedCount)
      return
    }
    setError(result.error)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Hi, {volunteerName}</h1>
        <p className="text-sm text-muted-foreground">
          Select the event participants who have joined your DGroup.
        </p>
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          You do not lead a DGroup yet. You can still tell us that you did not absorb anyone.
        </p>
      )}

      <div className="divide-y overflow-hidden rounded-lg border">
        {participants.map((participant) => {
          const isSelected = !!selected[participant.id]
          return (
            <div key={participant.id} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`participant-${participant.id}`}
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    setSelected((current) => ({ ...current, [participant.id]: checked === true }))
                    setError("")
                  }}
                />
                <label htmlFor={`participant-${participant.id}`} className="min-w-0 cursor-pointer">
                  <span className="block text-sm font-medium">{participant.name}</span>
                  <span className="block text-xs text-muted-foreground">{participant.kind}</span>
                </label>
              </div>
              {isSelected && groups.length > 0 && (
                <Select
                  value={destinations[participant.id] ?? ""}
                  onValueChange={(value) => {
                    setDestinations((current) => ({ ...current, [participant.id]: value }))
                    setError("")
                  }}
                >
                  <SelectTrigger aria-label={`DGroup for ${participant.name}`}>
                    <SelectValue placeholder="Choose your DGroup" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
        {submitting
          ? "Saving..."
          : selectedParticipants.length === 0
            ? "Submit no placements"
            : `Place ${selectedParticipants.length} participant${selectedParticipants.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  )
}
