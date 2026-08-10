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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PersonCombobox, type PersonComboboxOption } from "@/components/ui/person-combobox"
import { promoteGuestToMember } from "./actions"
import { listSmallGroupOptions } from "../small-groups/actions"

type Props = {
  guestId: string
  guestName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The caller decides where to go next — refresh the list, or open the new member. */
  onPromoted?: (memberId: string) => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Turns a guest into a member. The DGroup is optional — joining one is not what
 * makes someone a member, and admins need to record a plain member too.
 *
 * Shared by the guests list row action and the guest detail header.
 */
export function PromoteGuestDialog({
  guestId,
  guestName,
  open,
  onOpenChange,
  onPromoted,
}: Props) {
  const [groupId, setGroupId] = React.useState("")
  const [dateJoined, setDateJoined] = React.useState(today)
  const [submitting, setSubmitting] = React.useState(false)
  const [groups, setGroups] = React.useState<PersonComboboxOption[] | null>(null)
  // A ref, not state: the in-flight guard must not itself trigger a render.
  const requestedGroups = React.useRef(false)
  const loadingGroups = groups === null

  // Loaded on first open rather than with the list page — most rows are never
  // promoted, and the dialog is the only thing that needs the roster.
  React.useEffect(() => {
    if (!open || requestedGroups.current) return
    requestedGroups.current = true
    listSmallGroupOptions().then((result) => {
      if (!result.success) {
        toast.error(result.error)
        setGroups([])
        return
      }
      setGroups(
        result.data.map((g) => ({
          value: g.id,
          label: g.name,
          hint:
            g.memberLimit !== null
              ? `${g.memberCount}/${g.memberLimit} members`
              : `${g.memberCount} members`,
        }))
      )
    })
  }, [open])

  function handleOpenChange(next: boolean) {
    if (submitting) return
    if (!next) {
      setGroupId("")
      setDateJoined(today())
    }
    onOpenChange(next)
  }

  async function handleSubmit() {
    setSubmitting(true)
    const result = await promoteGuestToMember(guestId, groupId || null, { dateJoined })
    setSubmitting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${guestName} is now a member`)
    onOpenChange(false)
    onPromoted?.(result.data.memberId)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to member</DialogTitle>
          <DialogDescription>
            Creates a Member record for <span className="font-medium">{guestName}</span> from
            their guest profile. The guest record is kept for history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="promote-group">DGroup</Label>
            <PersonCombobox
              id="promote-group"
              options={groups ?? []}
              value={groupId}
              onValueChange={setGroupId}
              clearable
              clearLabel="No DGroup — member only"
              placeholder={loadingGroups ? "Loading DGroups…" : "No DGroup"}
              searchPlaceholder="Search DGroups…"
              emptyText="No DGroups found."
              disabled={submitting || loadingGroups}
            />
            <p className="text-xs text-muted-foreground">
              {groupId
                ? "They will be added to this DGroup immediately, without leader confirmation."
                : "Leave blank to make them a member without assigning a DGroup."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="promote-date-joined">Date joined</Label>
            <Input
              id="promote-date-joined"
              type="date"
              required
              value={dateJoined}
              onChange={(e) => setDateJoined(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !dateJoined}>
            {submitting ? "Promoting…" : "Promote to member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
