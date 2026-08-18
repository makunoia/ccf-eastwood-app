"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconArrowDown } from "@tabler/icons-react"

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
 * Framed as a prompt while the day has no tables and as a quiet utility once it
 * does, because those are two different moments: the first is "how do I start",
 * the second is "add the other ministry's as well".
 *
 * The members checkbox is off by default and says what it takes. Carrying rosters
 * across only makes sense once the day's registrations exist, and for a recurring
 * source event the members are its standing roster rather than anyone who signed
 * up for the collab — so the copy has to be specific enough that an admin can tell
 * whether it is what they want.
 */
export function CarryOverBreakoutsCard({
  clusterId,
  events,
  hasGroups,
}: {
  clusterId: string
  events: { id: string; name: string }[]
  hasGroups: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [fromEventId, setFromEventId] = React.useState("")
  const [includeMembers, setIncludeMembers] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

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
    setOpen(false)
    setFromEventId("")
    setIncludeMembers(false)
    router.refresh()
  }

  return (
    <>
      {hasGroups ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <IconArrowDown />
            Carry over breakouts
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">This day has no breakout groups yet</p>
            <p className="text-sm text-muted-foreground">
              Collab breakouts are set up fresh for the session. Add them below, or
              carry a ministry&apos;s existing tables over as a starting point.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <IconArrowDown />
            Carry over breakouts
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="carry-over-members"
                checked={includeMembers}
                onCheckedChange={(v) => setIncludeMembers(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="carry-over-members"
                className="text-sm font-normal leading-snug"
              >
                Also bring their current members
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Off means the tables arrive empty and the day&apos;s distribution
                  starts fresh — the usual choice. On copies whoever is in those
                  groups right now, which for a recurring event is its standing
                  roster rather than the people registered for this day.
                </span>
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCarryOver} disabled={saving || !fromEventId}>
              {saving ? "Carrying over…" : "Carry over"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
