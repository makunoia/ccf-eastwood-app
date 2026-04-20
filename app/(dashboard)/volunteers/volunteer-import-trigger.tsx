"use client"

import * as React from "react"
import { IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkVolunteerDuplicates, importVolunteers } from "./import-actions"

type Props = {
  events: { id: string; name: string }[]
}

export function VolunteerImportTrigger({ events }: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState(events[0]?.id ?? "")

  function handleOpen() {
    setSelectedId(events[0]?.id ?? "")
    setDialogOpen(true)
  }

  function handleConfirm() {
    if (!selectedId) return
    setDialogOpen(false)
    setImportOpen(true)
  }

  const context = { eventId: selectedId }

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Import Volunteers</DialogTitle>
            <DialogDescription>
              Select the event you&apos;re importing volunteers for.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Event</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {events.length === 0 && (
                <option disabled value="">
                  No events available
                </option>
              )}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedId}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportWizard
        config={{ entity: "volunteer", context }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkVolunteerDuplicates}
        onImport={(rows) => importVolunteers(context, rows)}
      />
    </>
  )
}
