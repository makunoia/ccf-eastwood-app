"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { carryOverBreakoutGroups } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Carry over a member event's breakout tables onto the collab day.
 *
 * Controlled: the trigger lives with whoever owns the screen — the Breakouts
 * header's "⋯" menu, and the empty-state prompt — so this file only owns the
 * form.
 *
 * The members checkbox is off by default and says what it takes. Carrying rosters
 * across only makes sense once the day's registrations exist, and for a recurring
 * source event the members are its standing roster rather than anyone who signed
 * up for the collab — so the copy has to be specific enough that an admin can tell
 * whether it is what they want. It is a full-width block under the checkbox, never
 * nested inside the `<Label>`: `Label` is itself a flex row, so a description put
 * inside it becomes a sibling column and both halves collapse to a few words wide.
 */
export function CarryOverBreakoutsDialog({
  clusterId,
  events,
  open,
  onOpenChange,
}: {
  clusterId: string
  events: { id: string; name: string }[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [fromEventId, setFromEventId] = React.useState("")
  const [includeMembers, setIncludeMembers] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Reset on close so the next open starts from the default answer rather than
  // whatever the last carry-over happened to pick.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setFromEventId("")
      setIncludeMembers(false)
    }
    onOpenChange(next)
  }

  async function handleCarryOver() {
    if (!fromEventId) {
      toast.error("Pick an event to carry over from.")
      return
    }
    setSaving(true)
    const result = await carryOverBreakoutGroups(clusterId, fromEventId, { includeMembers })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    const { created, membersCopied, membersSkipped } = result.data
    toast.success(
      [
        `${created} breakout ${created === 1 ? "group" : "groups"} carried over`,
        membersCopied > 0 ? `${membersCopied} placed` : null,
        membersSkipped > 0 ? `${membersSkipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    )
    handleOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carry over breakout groups</DialogTitle>
          <DialogDescription>
            Copies an event&apos;s breakout groups onto this day — names,
            facilitators, matching criteria, limits and linked DGroups. The copies
            are independent: editing them here never changes the event&apos;s own
            groups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="carry-over-from">Carry over from</Label>
            <Select value={fromEventId} onValueChange={setFromEventId}>
              <SelectTrigger id="carry-over-from" className="w-full">
                <SelectValue placeholder="Pick an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="carry-over-members"
                checked={includeMembers}
                onCheckedChange={(v) => setIncludeMembers(v === true)}
              />
              <Label htmlFor="carry-over-members" className="font-normal">
                Also bring their current members
              </Label>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Off means the tables arrive empty and the day&apos;s distribution starts
              fresh — the usual choice. On copies whoever is in those groups right
              now, which for a recurring event is its standing roster rather than the
              people registered for this day.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleCarryOver} disabled={saving || !fromEventId}>
            {saving ? "Carrying over…" : "Carry over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
