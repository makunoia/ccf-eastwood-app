"use client"

import * as React from "react"
import { IconDownload, IconPlus, IconUpload } from "@tabler/icons-react"
import { PageActions, type PageAction } from "@/components/page-header"
import { ImportWizard } from "@/components/import/import-wizard"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { exportEventVolunteersCSV } from "@/lib/export-entities"
import { exportFilename } from "@/lib/exports/filename"
import {
  VOLUNTEER_EXPORT_GROUPS,
  type EventVolunteerExportRow,
  type VolunteerExportGroup,
} from "@/lib/exports/event-volunteers"
import {
  checkVolunteerDuplicates,
  importVolunteers,
} from "@/app/(dashboard)/volunteers/import-actions"
import { getEventVolunteersExport } from "./export-actions"

type Props = {
  eventId: string
  eventName: string
  canExport: boolean
}

export function VolunteersToolbar({ eventId, eventName, canExport }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)
  const context = { eventId }

  const { open: openExport, dialog: exportDialog } = useExportColumnsDialog<
    EventVolunteerExportRow,
    VolunteerExportGroup
  >({
    title: "Export volunteers",
    description: "Everyone serving this event, with their committee, roles and status.",
    groups: VOLUNTEER_EXPORT_GROUPS,
    unit: ["volunteer", "volunteers"],
    emptyMessage: "No volunteers to export yet.",
    loadingMessage: "Gathering volunteers…",
    load: () => getEventVolunteersExport(eventId),
    download: (rows, selected) =>
      exportEventVolunteersCSV(exportFilename(eventName, "volunteers"), rows, selected),
  })

  const actions: PageAction[] = [
    {
      label: "Import",
      icon: <IconUpload className="size-4" />,
      onSelect: () => setImportOpen(true),
      overflow: true,
    },
    ...(canExport
      ? [
          {
            label: "Export",
            icon: <IconDownload className="size-4" />,
            onSelect: openExport,
            overflow: true,
          } satisfies PageAction,
        ]
      : []),
  ]

  return (
    <PageActions
      primary={{
        label: "Add Volunteer",
        icon: <IconPlus className="size-4" />,
        href: `/event/${eventId}/volunteers/new`,
      }}
      actions={actions}
    >
      <ImportWizard
        config={{ entity: "volunteer", context }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkVolunteerDuplicates}
        onImport={(rows) => importVolunteers(context, rows)}
      />

      {exportDialog}
    </PageActions>
  )
}
