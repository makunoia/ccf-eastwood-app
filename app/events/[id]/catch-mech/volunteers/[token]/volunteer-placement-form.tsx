"use client"

import * as React from "react"
import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  searchCatchMechVolunteerParticipants,
  submitCatchMechVolunteerPlacements,
  type VolunteerParticipantResult,
} from "../actions"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"

type SmallGroup = {
  id: string
  name: string
}

type Props = {
  token: string
  volunteerName: string
  /** Whether anyone at this event is still eligible to be placed. */
  hasEligibleParticipants: boolean
  groups: SmallGroup[]
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 300

export function VolunteerPlacementForm({
  token,
  volunteerName,
  hasEligibleParticipants,
  groups,
}: Props) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<VolunteerParticipantResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [searched, setSearched] = React.useState(false)
  // Insertion-ordered so the list doesn't reshuffle as people are added.
  const [selected, setSelected] = React.useState<VolunteerParticipantResult[]>([])
  const [destinations, setDestinations] = React.useState<Record<string, string>>({})
  const [newGroupName, setNewGroupName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [completed, setCompleted] = React.useState<{
    count: number
    createdGroup: string | null
  } | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // With a single DGroup there is nothing to choose — every placement goes there.
  const onlyGroupId = groups.length === 1 ? groups[0].id : null
  const needsGroupChoice = groups.length > 1
  /**
   * A volunteer who leads nothing yet becomes a Leader by absorbing someone —
   * so instead of picking a destination they name the DGroup they are starting,
   * and this one submission creates it.
   */
  const createsGroup = groups.length === 0 && selected.length > 0

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    setError("")
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearching(false)
      setSearched(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const result = await searchCatchMechVolunteerParticipants(token, value)
      setSearching(false)
      setSearched(true)
      if (result.success) {
        setResults(result.data)
      } else {
        setResults([])
        setError(result.error)
      }
    }, SEARCH_DEBOUNCE_MS)
  }

  function addParticipant(participant: VolunteerParticipantResult) {
    setSelected((current) =>
      current.some((entry) => entry.registrantId === participant.registrantId)
        ? current
        : [...current, participant]
    )
    if (onlyGroupId) {
      setDestinations((current) => ({ ...current, [participant.registrantId]: onlyGroupId }))
    }
    setError("")
    // Clear the search so the next person can be typed straight away — the
    // selected list below is the record of what's been added.
    setQuery("")
    setResults([])
    setSearched(false)
  }

  function removeParticipant(registrantId: string) {
    setSelected((current) => current.filter((entry) => entry.registrantId !== registrantId))
    setDestinations((current) => {
      const next = { ...current }
      delete next[registrantId]
      return next
    })
    setError("")
  }

  async function handleSubmit() {
    if (createsGroup && !newGroupName.trim()) {
      setError("Name the DGroup these participants are joining")
      return
    }
    if (!createsGroup && selected.some((p) => !destinations[p.registrantId])) {
      setError("Choose a DGroup for every person you added")
      return
    }

    setError("")
    setSubmitting(true)
    const result = await callAction(
      () =>
        submitCatchMechVolunteerPlacements(
          token,
          selected.map((participant) => ({
            registrantId: participant.registrantId,
            // Null hands the destination to the group this submission creates.
            smallGroupId: createsGroup ? null : destinations[participant.registrantId],
          })),
          createsGroup ? newGroupName : undefined
        ),
      "submitCatchMechVolunteerPlacements"
    )
    setSubmitting(false)

    if (!result) {
      setError(SUBMIT_NETWORK_ERROR)
      return
    }
    if (result.success) {
      setCompleted({
        count: result.data.placedCount,
        createdGroup: result.data.createdGroupId ? newGroupName.trim() : null,
      })
      return
    }
    setError(result.error)
  }

  if (completed !== null) {
    return (
      <div className="space-y-2 py-3 text-center">
        <h1 className="text-xl font-semibold">Thank you, {volunteerName}</h1>
        <p className="text-sm text-muted-foreground">
          {completed.count === 0
            ? "Your response has been recorded."
            : `${completed.count} participant${completed.count === 1 ? "" : "s"} joined your DGroup.`}
        </p>
        {completed.createdGroup && (
          <p className="text-sm text-muted-foreground">
            {completed.createdGroup} has been created and you are now its leader.
          </p>
        )}
      </div>
    )
  }

  if (!hasEligibleParticipants) {
    return (
      <div className="space-y-3 py-3 text-center">
        <h1 className="text-xl font-semibold">Everyone is already connected</h1>
        <p className="text-sm text-muted-foreground">
          There are no event participants waiting to join a DGroup.
        </p>
      </div>
    )
  }

  const trimmedQuery = query.trim()
  const showEmptyResult =
    !searching && searched && trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Hi, {volunteerName}</h1>
        <p className="text-sm text-muted-foreground">
          Search for the people who have joined your DGroup, then add them one by one.
        </p>
      </div>

      {groups.length === 0 && selected.length === 0 && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          You do not lead a DGroup yet. Add anyone who joined you and we will start
          one for you — or submit as-is if you absorbed no one.
        </p>
      )}

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="participant-search">Search by name</Label>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="participant-search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="e.g. Juan dela Cruz"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" />
            Searching…
          </div>
        )}

        {!searching && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((participant) => {
              const alreadyAdded = selected.some(
                (entry) => entry.registrantId === participant.registrantId
              )
              return (
                <li key={participant.registrantId}>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => addParticipant(participant)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-60 disabled:hover:bg-background"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium wrap-break-word">
                        {participant.name}
                        {participant.nickname && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            ({participant.nickname})
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {participant.kind === "Guest" ? "First-time attendee" : "Returning member"}
                        {participant.contactHint && ` · ${participant.contactHint}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {alreadyAdded ? "Added" : "Add"}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {showEmptyResult && (
          <p className="text-sm text-muted-foreground">
            No one found for &ldquo;{trimmedQuery}&rdquo;. They may already be in a DGroup.
          </p>
        )}
      </div>

      {/* ── Selected ─────────────────────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Joining your DGroup ({selected.length})
          </p>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {selected.map((participant) => (
              <li key={participant.registrantId} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium wrap-break-word">
                      {participant.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {participant.kind === "Guest" ? "First-time attendee" : "Returning member"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeParticipant(participant.registrantId)}
                    aria-label={`Remove ${participant.name}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <IconX className="size-4" />
                  </button>
                </div>

                {needsGroupChoice && (
                  <Select
                    value={destinations[participant.registrantId] ?? ""}
                    onValueChange={(value) => {
                      setDestinations((current) => ({
                        ...current,
                        [participant.registrantId]: value,
                      }))
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
              </li>
            ))}
          </ul>
          {onlyGroupId && (
            <p className="text-xs text-muted-foreground">
              Everyone above joins {groups[0].name}.
            </p>
          )}

          {createsGroup && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
              <Label htmlFor="new-group-name">Name your DGroup</Label>
              <Input
                id="new-group-name"
                value={newGroupName}
                onChange={(event) => {
                  setNewGroupName(event.target.value)
                  setError("")
                }}
                placeholder="e.g. Juan's DGroup"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                You do not lead a DGroup yet, so submitting creates this one with you
                as its leader. Everyone above joins it.
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
        {submitting
          ? "Saving..."
          : selected.length === 0
            ? "Submit no placements"
            : `Place ${selected.length} participant${selected.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  )
}
