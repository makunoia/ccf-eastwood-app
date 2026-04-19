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

type Ministry = { id: string; name: string }
type Event    = { id: string; name: string }

type Props = {
  ministries: Ministry[]
  events: Event[]
}

type ScopeType = "ministry" | "event"

export function VolunteerImportTrigger({ ministries, events }: Props) {
  const [scopeDialogOpen, setScopeDialogOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [scopeType, setScopeType] = React.useState<ScopeType>("ministry")
  const [selectedId, setSelectedId] = React.useState("")

  function handleScopeConfirm() {
    if (!selectedId) return
    setScopeDialogOpen(false)
    setImportOpen(true)
  }

  function handleScopeOpen() {
    setScopeType("ministry")
    setSelectedId(ministries[0]?.id ?? events[0]?.id ?? "")
    setScopeDialogOpen(true)
  }

  const context = scopeType === "ministry"
    ? { ministryId: selectedId }
    : { eventId: selectedId }

  return (
    <>
      <Button variant="outline" onClick={handleScopeOpen}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      {/* Scope selection dialog */}
      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Import Volunteers</DialogTitle>
            <DialogDescription>Select whether you&apos;re importing volunteers for a ministry or an event.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Scope type toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              {(["ministry", "event"] as ScopeType[]).map((t) => (
                <button
                  key={t}
                  className={[
                    "flex-1 py-2 text-sm font-medium transition-colors capitalize",
                    scopeType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  ].join(" ")}
                  onClick={() => {
                    setScopeType(t)
                    setSelectedId(t === "ministry" ? (ministries[0]?.id ?? "") : (events[0]?.id ?? ""))
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Entity select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium capitalize">{scopeType}</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(scopeType === "ministry" ? ministries : events).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
                {(scopeType === "ministry" ? ministries : events).length === 0 && (
                  <option disabled value="">No {scopeType}s available</option>
                )}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScopeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleScopeConfirm} disabled={!selectedId}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import wizard — opened after scope is confirmed */}
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
