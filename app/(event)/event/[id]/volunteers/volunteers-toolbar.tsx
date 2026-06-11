"use client"

import * as React from "react"
import Link from "next/link"
import { IconPlus, IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
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
      actions={[
        {
          label: "Import",
          icon: <IconUpload className="size-4" />,
          onSelect: () => setImportOpen(true),
        },
      ]}
    >
      <Button asChild>
        <Link href={`/event/${eventId}/volunteers/new`}>
          <IconPlus className="size-4" />
          Add Volunteer
        </Link>
      </Button>

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
