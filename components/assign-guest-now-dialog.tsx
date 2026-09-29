"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type GuestAssignmentTarget = { id: string; name: string }

type Props = {
  guestId: string
  guestName: string
  target: GuestAssignmentTarget | null
  onOpenChange: (target: GuestAssignmentTarget | null) => void
}

export function AssignGuestNowDialog({ guestId, guestName, target, onOpenChange }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = React.useState(false)

  async function handleConfirm() {
    if (!target || submitting) return
    setSubmitting(true)
    const result = await promoteGuestToMember(guestId, target.id)
    setSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${guestName} is now a member of ${target.name}`)
    onOpenChange(null)
    router.refresh()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !submitting) onOpenChange(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign now</DialogTitle>
          <DialogDescription>
            Promote <span className="font-medium">{guestName}</span> to a member and add them to{" "}
            <span className="font-medium">{target?.name}</span> today, without leader confirmation.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(null)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={() => { void handleConfirm() }} disabled={submitting}>
            {submitting ? "Assigning…" : "Promote and assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
