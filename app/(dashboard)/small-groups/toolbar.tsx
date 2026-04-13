"use client"

import * as React from "react"
import Link from "next/link"
import { IconPlus, IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkSmallGroupDuplicates, importSmallGroups } from "./import-actions"

export function SmallGroupsToolbar() {
  const [importOpen, setImportOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setImportOpen(true)}>
        <IconUpload className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <Button asChild>
        <Link href="/small-groups/new">
          <IconPlus />
          <span className="hidden sm:inline">Add Group</span>
        </Link>
      </Button>

      <ImportWizard
        config={{ entity: "small-group" }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={(rows) =>
          checkSmallGroupDuplicates(rows)
        }
        onImport={(rows) => importSmallGroups(rows)}
      />
    </div>
  )
}
