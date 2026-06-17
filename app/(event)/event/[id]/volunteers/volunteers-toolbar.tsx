"use client"

import * as React from "react"
import { IconPlus, IconUpload } from "@tabler/icons-react"
import { PageActions } from "@/components/page-header"
import { ImportWizard } from "@/components/import/import-wizard"
import {
  checkVolunteerDuplicates,
  importVolunteers,
} from "@/app/(dashboard)/volunteers/import-actions"

type Props = {
  eventId: string
}

export function VolunteersToolbar({ eventId }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)
  const context = { eventId }

  return (
    <PageActions
      primary={{
        label: "Add Volunteer",
        icon: <IconPlus className="size-4" />,
        href: `/event/${eventId}/volunteers/new`,
      }}
      actions={[
        {
          label: "Import",
          icon: <IconUpload className="size-4" />,
          onSelect: () => setImportOpen(true),
        },
      ]}
    >
      <ImportWizard
        config={{ entity: "volunteer", context }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkVolunteerDuplicates}
        onImport={(rows) => importVolunteers(context, rows)}
      />
    </PageActions>
  )
}
