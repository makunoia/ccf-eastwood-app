"use client"

import * as React from "react"
import { IconDownload, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { PageActions, type PageAction } from "@/components/page-header"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkGuestDuplicates, importGuests } from "./import-actions"
import { exportGuestsCSV, type GuestExportRow } from "@/lib/export-entities"
import type { GuestRow } from "./columns"

function toExportRow(g: GuestRow): GuestExportRow {
  return {
    firstName: g.firstName,
    lastName: g.lastName,
    nickname: g.nickname,
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

  const actions: PageAction[] = [
    ...(canExport
      ? [{
          label: "Export",
          icon: <IconDownload className="size-4" />,
          onSelect: handleExport,
          disabled: guests.length === 0,
        }]
      : []),
    ...(canImport
      ? [{
          label: "Import",
          icon: <IconUpload className="size-4" />,
          onSelect: () => setImportOpen(true),
        }]
      : []),
  ]

  return (
    <PageActions
      primary={{
        label: "Add Guest",
        icon: <IconPlus />,
        href: "/guests/new",
      }}
      actions={actions}
    >
      <ImportWizard
        config={{ entity: "guest", useExistingEnriches: true, detectSharedContacts: true }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkGuestDuplicates}
        onImport={(rows) => importGuests(rows)}
      />
    </PageActions>
  )
}
