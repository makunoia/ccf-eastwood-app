"use client"

import * as React from "react"
import { IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import {
  checkVolunteerDuplicates,
  importVolunteers,
} from "@/app/(dashboard)/volunteers/import-actions"

type Props = {
  eventId: string
}

export function VolunteerImportButton({ eventId }: Props) {
  const [open, setOpen] = React.useState(false)
  const context = { eventId }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <ImportWizard
        config={{ entity: "volunteer", context }}
        open={open}
        onOpenChange={setOpen}
        onCheckDuplicates={checkVolunteerDuplicates}
        onImport={(rows) => importVolunteers(context, rows)}
      />
    </>
  )
}
