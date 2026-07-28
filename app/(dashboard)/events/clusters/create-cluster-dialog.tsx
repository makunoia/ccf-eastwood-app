"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconPlus } from "@tabler/icons-react"
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
import { Textarea } from "@/components/ui/textarea"
import { PageActions } from "@/components/page-header"
import { createEventCluster } from "@/app/(dashboard)/events/cluster-actions"

export function ClustersToolbar() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [date, setDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required.")
      return
    }
    setSaving(true)
    const result = await createEventCluster({
      name,
      description: description || null,
      date: date || null,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Event cluster created")
      setOpen(false)
      router.push(`/cluster/${result.data.id}`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <PageActions
      primary={{
        label: "New Cluster",
        icon: <IconPlus />,
        onSelect: () => setOpen(true),
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New event cluster</DialogTitle>
            <DialogDescription>
              Group several events into one &quot;event day&quot; with a shared registration
              form and a combined workspace. You&apos;ll add the events next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cluster-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cluster-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Super Sunday"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cluster-date">Date</Label>
              <Input
                id="cluster-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cluster-description">Description</Label>
              <Textarea
                id="cluster-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's happening on this day?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageActions>
  )
}
