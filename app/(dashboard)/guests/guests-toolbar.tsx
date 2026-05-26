"use client"

import * as React from "react"
import Link from "next/link"
import { IconDownload, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkGuestDuplicates, importGuests } from "./import-actions"
import { exportGuestsCSV, type GuestExportRow } from "@/lib/export-entities"
import type { GuestRow } from "./columns"

function toExportRow(g: GuestRow): GuestExportRow {
  return {
    firstName: g.firstName,
    lastName: g.lastName,
    email: g.email,
    phone: g.phone,
    lifeStage: g.lifeStage,
    gender: g.gender,
    language: g.language,
    birthMonth: g.birthMonth,
    birthYear: g.birthYear,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    notes: g.notes,
    dateAdded: g.dateAdded,
  }
}

type Props = {
  guests: GuestRow[]
  canImport: boolean
  canExport: boolean
}

export function GuestsToolbar({ guests, canImport, canExport }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)

  function handleExport() {
    if (guests.length === 0) {
      toast.error("Nothing to export — list is empty.")
      return
    }
    exportGuestsCSV(guests.map(toExportRow))
    toast.success(`Exported ${guests.length} guest${guests.length === 1 ? "" : "s"}.`)
  }

  return (
    <div className="flex items-center gap-2">
      {canExport && (
        <Button variant="outline" onClick={handleExport} disabled={guests.length === 0}>
          <IconDownload className="size-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      )}

      {canImport && (
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <IconUpload className="size-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>
      )}

      <Button asChild>
        <Link href="/guests/new">
          <IconPlus />
          <span className="hidden sm:inline">Add Guest</span>
        </Link>
      </Button>

      <ImportWizard
        config={{ entity: "guest" }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkGuestDuplicates}
        onImport={(rows) => importGuests(rows)}
      />
    </div>
  )
}
