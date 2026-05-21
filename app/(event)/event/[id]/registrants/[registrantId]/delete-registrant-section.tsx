"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { deleteEventRegistrant } from "../import-actions"

type Props = {
  registrantId: string
  eventId: string
  name: string
}

export function DeleteRegistrantSection({ registrantId, eventId, name }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEventRegistrant(registrantId, eventId)
    setDeleting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Registration deleted")
    router.push(`/event/${eventId}/registrants`)
  }

  return (
    <>
      <div className="mt-12 max-w-2xl border-t pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete registration</p>
            <p className="text-xs text-muted-foreground">
              Permanently removes this registrant from the event. This cannot be undone.
            </p>
          </div>
          <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{name}</span> from this event?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
