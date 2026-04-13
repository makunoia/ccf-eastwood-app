"use client"

import * as React from "react"
import { IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkGuestDuplicates, importGuests } from "./import-actions"

export function GuestsToolbar() {
  const [importOpen, setImportOpen] = React.useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <ImportWizard
        config={{ entity: "guest" }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkGuestDuplicates}
        onImport={(rows) => importGuests(rows)}
      />
    </>
  )
}
