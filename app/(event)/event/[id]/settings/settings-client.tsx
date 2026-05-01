"use client"

import * as React from "react"
import { IconBus, IconCross, IconFish, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  enableModule,
  disableModule,
  createBus,
  updateBus,
  deleteBus,
} from "@/app/(dashboard)/events/module-actions"
import { CommitteeManager } from "@/app/(dashboard)/events/[id]/committees"

// ─── Types ────────────────────────────────────────────────────────────────────

type BusRow = {
  id: string
  name: string
  capacity: number | null
  direction: string
  _count: { passengers: number }
}

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

type Props = {
  eventId: string
  enabledModules: string[]
  buses: BusRow[]
  committees: Committee[]
  showEmbarkation: boolean
}

type BusFormValues = { name: string; capacity: string; direction: string }
const defaultBusForm: BusFormValues = { name: "", capacity: "", direction: "ToVenue" }

const DIRECTION_LABELS: Record<string, string> = {
  ToVenue: "To Venue",
  FromVenue: "From Venue",
  Both: "Both ways",
}

// ─── Bus dialog ───────────────────────────────────────────────────────────────

function BusDialog({
  open,
  onOpenChange,
  eventId,
  bus,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  bus?: BusRow
}) {
  const isEdit = !!bus
  const [form, setForm] = React.useState<BusFormValues>(
    bus
      ? { name: bus.name, capacity: bus.capacity?.toString() ?? "", direction: bus.direction }
      : defaultBusForm
  )
  const [saving, setSaving] = React.useState(false)

  function set(field: keyof BusFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = isEdit
      ? await updateBus(bus!.id, eventId, form)
      : await createBus(eventId, form)
    setSaving(false)
    if (result.success) {
      toast.success(isEdit ? "Bus updated" : "Bus added")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bus" : "Add bus"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="busName">Name <span className="text-destructive">*</span></Label>
            <Input
              id="busName"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Bus 1"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="busCapacity">Capacity</Label>
            <Input
              id="busCapacity"
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              placeholder="Leave blank for unlimited"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="busDirection">Direction</Label>
            <Select value={form.direction} onValueChange={(v) => set("direction", v)}>
              <SelectTrigger id="busDirection"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ToVenue">To Venue</SelectItem>
                <SelectItem value="FromVenue">From Venue</SelectItem>
                <SelectItem value="Both">Both ways</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add bus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EventSettingsClient({ eventId, enabledModules, buses, committees, showEmbarkation }: Props) {
  const [modules, setModules] = React.useState<Set<string>>(new Set(enabledModules))
  const [togglingModule, setTogglingModule] = React.useState<string | null>(null)
  const [busDialogOpen, setBusDialogOpen] = React.useState(false)
  const [editingBus, setEditingBus] = React.useState<BusRow | undefined>()
  const [deletingBusId, setDeletingBusId] = React.useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [busToDelete, setBusToDelete] = React.useState<BusRow | undefined>()

  async function handleToggleModule(type: string) {
    setTogglingModule(type)
    const enabled = modules.has(type)
    const result = enabled
      ? await disableModule(eventId, type as "Baptism" | "Embarkation" | "CatchMech")
      : await enableModule(eventId, type as "Baptism" | "Embarkation" | "CatchMech")
    setTogglingModule(null)
    if (result.success) {
      setModules((prev) => {
        const next = new Set(prev)
        if (enabled) { next.delete(type) } else { next.add(type) }
        return next
      })
    } else {
      toast.error(result.error)
    }
  }

  async function handleDeleteBus() {
    if (!busToDelete) return
    setDeletingBusId(busToDelete.id)
    const result = await deleteBus(busToDelete.id, eventId)
    setDeletingBusId(null)
    if (result.success) {
      toast.success("Bus deleted")
      setDeleteDialogOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="type-headline">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure modules and options for this event</p>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="committees">Committees</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-6">
          <section className="space-y-4 max-w-2xl">
            <h3 className="type-label text-muted-foreground">Add-on Modules</h3>

            {/* Baptism */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <IconCross className="size-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Baptism</CardTitle>
                      <CardDescription className="mt-0.5">
                        Track registrants who will be baptized at this event. Managed mid-event by admin.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={modules.has("Baptism")}
                    onCheckedChange={() => handleToggleModule("Baptism")}
                    disabled={togglingModule === "Baptism"}
                  />
                </div>
              </CardHeader>
            </Card>

            {/* Embarkation — only for OneTime/MultiDay */}
            {showEmbarkation && (
              <Card>
                <CardHeader className={modules.has("Embarkation") ? "pb-3" : undefined}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <IconBus className="size-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">Embarkation</CardTitle>
                        <CardDescription className="mt-0.5">
                          Assign registrants and volunteers to buses. Print a manifest per bus.
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={modules.has("Embarkation")}
                      onCheckedChange={() => handleToggleModule("Embarkation")}
                      disabled={togglingModule === "Embarkation"}
                    />
                  </div>
                </CardHeader>

                {modules.has("Embarkation") && (
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Buses</p>
                      <Button size="sm" variant="outline" onClick={() => { setEditingBus(undefined); setBusDialogOpen(true) }}>
                        <IconPlus className="mr-1 size-3.5" />
                        Add bus
                      </Button>
                    </div>
                    {buses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No buses added yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {buses.map((bus) => (
                          <div
                            key={bus.id}
                            className="flex items-center justify-between rounded-lg border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{bus.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {DIRECTION_LABELS[bus.direction]} ·{" "}
                                {bus._count.passengers} assigned
                                {bus.capacity != null && ` / ${bus.capacity}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => { setEditingBus(bus); setBusDialogOpen(true) }}
                              >
                                <IconPencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => { setBusToDelete(bus); setDeleteDialogOpen(true) }}
                              >
                                <IconTrash className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}
            {/* Catch Mech */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <IconFish className="size-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Catch Mech</CardTitle>
                      <CardDescription className="mt-0.5">
                        Enable facilitators to confirm breakout group members into their small groups via a weekly link.
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={modules.has("CatchMech")}
                    onCheckedChange={() => handleToggleModule("CatchMech")}
                    disabled={togglingModule === "CatchMech"}
                  />
                </div>
              </CardHeader>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="committees" className="mt-6 max-w-2xl">
          <CommitteeManager eventId={eventId} committees={committees} />
        </TabsContent>
      </Tabs>

      <BusDialog
        open={busDialogOpen}
        onOpenChange={setBusDialogOpen}
        eventId={eventId}
        bus={editingBus}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bus</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{busToDelete?.name}</span>?
            All passenger assignments will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={!!deletingBusId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBus} disabled={!!deletingBusId}>
              {deletingBusId ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
