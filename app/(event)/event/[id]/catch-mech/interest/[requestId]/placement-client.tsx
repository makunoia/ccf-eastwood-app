"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { SmallGroupMatchCard } from "@/components/small-group-match-card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDayOfWeek, formatTime } from "@/lib/format/schedule"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"
import {
  assignCatchMechInterest, getCatchMechInterestGroups, getCatchMechInterestMatches,
  type InterestGroupOption, type InterestMatchLevel,
} from "../../interest-actions"
import { interestRequestState, type InterestRow } from "../../interest-tracker"

type GroupLoadResult =
  | { success: true; data: InterestMatchLevel[] | InterestGroupOption[] }
  | { success: false; error: string }

type Props = { eventId: string; request: InterestRow; canManage: boolean }

function meetingDetails(group: InterestGroupOption): string {
  return [
    group.meetingFormat === "InPerson" ? "In person" : group.meetingFormat,
    group.locationCity,
    group.scheduleDayOfWeek !== null ? formatDayOfWeek(group.scheduleDayOfWeek) : null,
    formatTime(group.scheduleTimeStart),
  ].filter(Boolean).join(" · ") || "Meeting details not provided"
}

export function InterestPlacement({ eventId, request, canManage }: Props) {
  const router = useRouter()
  const [tab, setTab] = React.useState("suggested")
  const [levels, setLevels] = React.useState<InterestMatchLevel[]>([])
  const [groups, setGroups] = React.useState<InterestGroupOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [retry, setRetry] = React.useState(0)
  const [query, setQuery] = React.useState("")
  const [assigning, setAssigning] = React.useState<string | null>(null)
  const [overCapacity, setOverCapacity] = React.useState<InterestGroupOption | null>(null)
  const actionable = canManage && request.status === "Pending" && !request.groupId

  React.useEffect(() => {
    if (!actionable) return
    let active = true
    async function load() {
      setLoading(true)
      setError("")
      const result = await callAction<GroupLoadResult>(
        () => tab === "suggested"
          ? getCatchMechInterestMatches(eventId, request.id)
          : getCatchMechInterestGroups(eventId, request.id),
        "loadInterestGroups"
      )
      if (!active) return
      setLoading(false)
      if (!result || !result.success) {
        setError(result ? result.error : SUBMIT_NETWORK_ERROR)
        return
      }
      if (tab === "suggested") setLevels(result.data as InterestMatchLevel[])
      else setGroups(result.data as InterestGroupOption[])
    }
    void load()
    return () => { active = false }
  }, [eventId, request.id, tab, retry, actionable])

  async function assign(groupId: string, overrideCapacity = false) {
    if (assigning) return
    setAssigning(groupId)
    setError("")
    const result = await callAction(
      () => assignCatchMechInterest(eventId, request.id, groupId, {
        mode: tab === "manual" ? "manual" : "suggested", overrideCapacity,
      }),
      "assignCatchMechInterest"
    )
    setAssigning(null)
    if (!result || !result.success) {
      setError(result ? result.error : SUBMIT_NETWORK_ERROR)
      return
    }
    toast.success(result.data === "placed" ? "Member placed in DGroup" : "Awaiting DGroup leader confirmation")
    router.push(`/event/${eventId}/catch-mech/interest`)
    router.refresh()
  }

  if (!actionable) {
    return (
      <p className="text-sm text-muted-foreground">
        {interestRequestState(request)}{request.groupName ? ` · ${request.groupName}` : ""}
        {!canManage && " · DGroup write permission is required to assign this request."}
      </p>
    )
  }

  const filtered = groups.filter((group) =>
    `${group.name} ${group.leaderName}`.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-sm text-muted-foreground">
        {request.personType === "Guest"
          ? "Assignment sends a request to the DGroup leader for confirmation."
          : "Members without a DGroup are placed immediately. Transfers require leader confirmation."}
      </p>
      <Tabs value={tab} onValueChange={(value) => { setLoading(true); setError(""); setTab(value) }}>
        <TabsList>
          <TabsTrigger value="suggested">Suggested matches</TabsTrigger>
          <TabsTrigger value="manual">Manual assignment</TabsTrigger>
        </TabsList>
        {error && (
          <div className="mt-4 space-y-2">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => { setRetry((value) => value + 1); router.refresh() }}>
              Refresh choices
            </Button>
          </div>
        )}
        <TabsContent value="suggested" className="space-y-5 pt-4">
          {loading ? (
            <Skeleton className="h-40 w-full" aria-label="Finding matching DGroups" />
          ) : !error && (levels.length ? levels.map((level) => (
            <section key={level.label} className="space-y-3">
              <h2 className="text-base font-semibold">{level.label}</h2>
              {level.matches.map((match) => (
                <SmallGroupMatchCard
                  key={match.groupId}
                  result={match}
                  showBreakdown
                  assigning={assigning === match.groupId}
                  onAssign={() => { void assign(match.groupId) }}
                />
              ))}
            </section>
          )) : (
            <p className="text-sm text-muted-foreground">
              No matching DGroups found. Use Manual assignment to search all active DGroups.
            </p>
          ))}
        </TabsContent>
        <TabsContent value="manual" className="space-y-4 pt-4">
          <Input
            aria-label="Search active DGroups"
            placeholder="Search by DGroup or leader name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Manual assignment allows you to choose outside the matching suggestions.
          </p>
          {loading ? (
            <Skeleton className="h-40 w-full" aria-label="Loading active DGroups" />
          ) : !error && (filtered.length ? (
            <ul className="divide-y rounded-lg border">
              {filtered.map((group) => {
                const full = group.memberLimit !== null && group.memberCount >= group.memberLimit
                return (
                  <li key={group.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div className="min-w-0 space-y-1">
                      <h2 className="font-medium">{group.name}</h2>
                      <p className="text-sm text-muted-foreground">{group.leaderName}</p>
                      <p className="text-sm text-muted-foreground">{meetingDetails(group)}</p>
                      <p className="text-sm">
                        {group.memberCount}{group.memberLimit !== null ? ` / ${group.memberLimit}` : ""} members{full ? " · Full" : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!!assigning}
                      onClick={() => full ? setOverCapacity(group) : void assign(group.id)}
                    >
                      {assigning === group.id ? "Assigning…" : full ? "Assign over capacity" : "Assign"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No active DGroups match your search.</p>)}
        </TabsContent>
      </Tabs>
      <AlertDialog open={!!overCapacity} onOpenChange={(open) => { if (!open && !assigning) setOverCapacity(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign over capacity?</AlertDialogTitle>
            <AlertDialogDescription>
              {overCapacity?.name} has {overCapacity?.memberCount} members and a limit of {overCapacity?.memberLimit}.
              Approving allows this person to join above that limit. Leader confirmation is still required for guests and transfers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!assigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!assigning}
              onClick={(event) => {
                event.preventDefault()
                if (overCapacity) void assign(overCapacity.id, true).then(() => setOverCapacity(null))
              }}
            >
              Assign over capacity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
