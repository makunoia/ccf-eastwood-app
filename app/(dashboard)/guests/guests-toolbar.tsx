"use client"

import * as React from "react"
import Link from "next/link"
import { IconPlus, IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkGuestDuplicates, importGuests } from "./import-actions"

export function GuestsToolbar() {
  const [importOpen, setImportOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

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
