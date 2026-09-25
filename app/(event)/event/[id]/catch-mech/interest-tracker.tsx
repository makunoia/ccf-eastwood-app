"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SmallGroupMatchCard } from "@/components/small-group-match-card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  assignCatchMechInterest,
  deleteCatchMechInterest,
  dismissCatchMechInterest,
  getCatchMechInterestMatches,
  type InterestMatchLevel,
} from "./interest-actions"

export type InterestRow = {
  id: string
  createdAt: Date
  personName: string
  personType: "Member" | "Guest"
  personId: string
  status: "Pending" | "Confirmed" | "Rejected"
  groupId: string | null
  groupName: string | null
}

const PERSON_LINK = "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

function requestState(row: InterestRow): string {
  if (row.status === "Confirmed") return "Placed"
  if (row.status === "Rejected") return row.groupId ? "Declined" : "Dismissed"
  return row.groupId ? "Awaiting leader confirmation" : "Awaiting placement"
}

export function InterestTracker({
  eventId,
  rows,
  canManage,
  canViewMembers,
  canViewGuests,
}: {
  eventId: string
  rows: InterestRow[]
  canManage: boolean
  canViewMembers: boolean
  canViewGuests: boolean
}) {
  const router = useRouter()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [levels, setLevels] = React.useState<InterestMatchLevel[]>([])
  const [loading, setLoading] = React.useState(false)
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [dismissing, setDismissing] = React.useState<InterestRow | null>(null)
  const [savingDismissal, setSavingDismissal] = React.useState(false)
  const [deleting, setDeleting] = React.useState<InterestRow | null>(null)
  const [savingDeletion, setSavingDeletion] = React.useState(false)
  const matchRequestVersion = React.useRef(0)

  async function openMatches(requestId: string) {
    const version = ++matchRequestVersion.current
    if (openId === requestId) {
      setOpenId(null)
      setLoading(false)
      return
    }
    setOpenId(requestId)
    setLevels([])
    setLoading(true)
    const result = await getCatchMechInterestMatches(eventId, requestId)
    if (version !== matchRequestVersion.current) return
    setLoading(false)
    if (result.success) setLevels(result.data)
    else toast.error(result.error)
  }

  async function assign(requestId: string, groupId: string) {
    if (assigningId) return
    setAssigningId(groupId)
    const result = await assignCatchMechInterest(eventId, requestId, groupId)
    setAssigningId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(result.data === "placed" ? "Member placed in DGroup" : "Awaiting DGroup leader confirmation")
    setOpenId(null)
    router.refresh()
  }

  async function dismiss() {
    if (!dismissing) return
    setSavingDismissal(true)
    const result = await dismissCatchMechInterest(eventId, dismissing.id)
    setSavingDismissal(false)
    setDismissing(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("DGroup interest dismissed")
    router.refresh()
  }

  async function deleteInterest() {
    if (!deleting) return
    setSavingDeletion(true)
    const result = await deleteCatchMechInterest(eventId, deleting.id)
    setSavingDeletion(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setDeleting(null)
    if (openId === deleting.id) setOpenId(null)
    toast.success("DGroup interest deleted")
    router.refresh()
  }

  const awaiting = rows.filter((row) => row.status === "Pending" && !row.groupId).length

  return (
    <section className="space-y-3" aria-labelledby="dgroup-interest-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="dgroup-interest-heading" className="text-base font-semibold">DGroup interest</h3>
          <p className="text-sm text-muted-foreground">People who asked to join a DGroup through this event.</p>
        </div>
        <p className="text-sm text-muted-foreground">{awaiting} awaiting placement</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border px-5 py-8 text-center text-sm text-muted-foreground">
          No DGroup interest requests from this event yet.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((row) => {
            const canOpenProfile = row.personType === "Member" ? canViewMembers : canViewGuests
            const profileHref = row.personType === "Member" ? `/members/${row.personId}` : `/guests/${row.personId}`
            const canAct = canManage && row.status === "Pending" && !row.groupId
            const canDelete = canManage && !row.groupId && (row.status === "Pending" || row.status === "Rejected")
            return (
              <div key={row.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {canOpenProfile ? (
                        <Link href={profileHref} className={PERSON_LINK}>{row.personName}</Link>
                      ) : (
                        <span className="font-medium">{row.personName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{row.personType}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {requestState(row)}
                      {row.groupName && <span> · {row.groupName}</span>}
                      <span> · {row.createdAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}</span>
                    </p>
                  </div>
                  {(canAct || canDelete) && (
                    <div className="flex shrink-0 items-center gap-2">
                      {canAct && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => void openMatches(row.id)}>
                            {openId === row.id ? "Close matches" : "Find DGroup"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDismissing(row)}>Dismiss</Button>
                        </>
                      )}
                      {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(row)}>Delete</Button>}
                    </div>
                  )}
                </div>

                {canAct && openId === row.id && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    {loading ? (
                      <p className="text-sm text-muted-foreground" role="status">Finding matching DGroups…</p>
                    ) : levels.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No eligible DGroups found. Review this person&apos;s matching profile and try again.
                      </p>
                    ) : (
                      levels.map((level) => (
                        <div key={level.label} className="space-y-2">
                          <p className="text-sm font-medium">{level.label}</p>
                          {level.matches.map((match) => (
                            <SmallGroupMatchCard
                              key={match.groupId}
                              result={match}
                              showBreakdown
                              assigning={assigningId === match.groupId}
                              onAssign={() => void assign(row.id, match.groupId)}
                            />
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={dismissing !== null} onOpenChange={(open) => { if (!open) setDismissing(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss {dismissing?.personName}&apos;s DGroup interest?</AlertDialogTitle>
            <AlertDialogDescription>
              The request will stay in this tracker as dismissed. Their matching profile is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingDismissal}>Keep request</AlertDialogCancel>
            <AlertDialogAction disabled={savingDismissal} onClick={() => void dismiss()}>
              {savingDismissal ? "Dismissing…" : "Dismiss request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !savingDeletion) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.personName}&apos;s DGroup interest?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the interest request from Catch Mech. Their guest or member profile is kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingDeletion}>Keep request</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={savingDeletion} onClick={() => void deleteInterest()}>
              {savingDeletion ? "Deleting…" : "Delete request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
