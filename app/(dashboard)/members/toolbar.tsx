"use client"

import * as React from "react"
import Link from "next/link"
import { IconPlus, IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkMemberDuplicates, importMembers } from "./import-actions"

export function MembersToolbar() {
  const [importOpen, setImportOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <Button asChild>
        <Link href="/members/new">
          <IconPlus />
          <span className="hidden sm:inline">Add Member</span>
        </Link>
      </Button>

      <ImportWizard
        config={{ entity: "member" }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkMemberDuplicates}
        onImport={(rows) => importMembers(rows)}
      />
    </div>
  )
}
