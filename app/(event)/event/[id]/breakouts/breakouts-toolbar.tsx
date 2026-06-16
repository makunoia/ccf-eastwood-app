"use client"

import * as React from "react"
import { IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import {
  checkBreakoutDuplicates,
  importBreakoutGroups,
} from "./import-actions"

type Props = {
  eventId: string
}

export function BreakoutsToolbar({ eventId }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)
  const context = { eventId }

  return (
    <>
      <Button variant="outline" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        Import
      </Button>

      <ImportWizard
        config={{ entity: "breakout-group", context, useExistingEnriches: true }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={(rows) => checkBreakoutDuplicates(context, rows)}
        onImport={(rows) => importBreakoutGroups(context, rows)}
      />
    </>
  )
}
