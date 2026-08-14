"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { resolveMemberRequestsBatch, type RequestDecision } from "./actions"

/**
 * Confirms an admin approving or denying DGroup requests **for** the leader, and
 * reports back which rows didn't take.
 *
 * One component for both the row buttons and the batch bar: the wording is the
 * only thing that changes between one request and twenty, and an approval that
 * promotes a guest to a member deserves the same explicit confirmation either
 * way. `subject` is the person's name when there's exactly one, so the single-row
 * case reads like a sentence instead of "Approve 1 request".
 */
export function RequestDecisionDialog({
  open,
  onOpenChange,
  ids,
  decision,
  subject,
  onResolved,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  ids: string[]
  decision: RequestDecision
  /** The single person's name, when the dialog covers exactly one request. */
  subject?: string | null
  /**
   * Called after a successful run with the ids that could not be resolved — the
   * batch bar keeps exactly those selected so the admin can see what's left.
   */
  onResolved?: (failedIds: string[]) => void
}) {
  const [pending, setPending] = React.useState(false)

  const count = ids.length
  const approving = decision === "approve"
  const noun = count === 1 ? "request" : "requests"
  const who = count === 1 && subject ? subject : `${count} ${noun}`

  async function handleConfirm() {
    setPending(true)
    const result = await resolveMemberRequestsBatch(ids, decision)
    setPending(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    const { resolved, failed } = result.data
    const verb = approving ? "Approved" : "Denied"
    if (failed.length === 0) {
      toast.success(`${verb} ${resolved} ${resolved === 1 ? "request" : "requests"}.`)
    } else {
      toast.warning(
        `${verb} ${resolved} of ${count}. ${failed.length} skipped: ${failed[0].name} ${failed[0].reason}${
          failed.length > 1 ? `, and ${failed.length - 1} more` : ""
        }.`
      )
    }
    onResolved?.(failed.map((f) => f.id))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approving ? "Approve" : "Deny"} {who}
          </DialogTitle>
          <DialogDescription>
            {approving ? (
              <>
                This places {count === 1 ? "them" : "everyone selected"} into the target DGroup
                and promotes any guest to a member. It&apos;s recorded on the leader&apos;s
                behalf, so they don&apos;t need to open their confirmation link.
              </>
            ) : (
              <>
                The {noun} will be marked rejected and leave this queue. Nobody joins a DGroup,
                and the person&apos;s record is kept — you can place them again later from their
                profile.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={approving ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending
              ? approving
                ? "Approving…"
                : "Denying…"
              : approving
                ? "Approve"
                : "Deny"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
