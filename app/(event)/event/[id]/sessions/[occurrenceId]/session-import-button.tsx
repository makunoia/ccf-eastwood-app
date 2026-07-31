"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import {
  checkSessionAttendanceDuplicates,
  importSessionAttendance,
} from "./import-actions"

export function SessionImportButton({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IconUpload className="size-4" />
        Import
      </Button>

      <ImportWizard
        config={{
          entity: "session-attendance",
          onSuccess: () => router.refresh(),
        }}
        open={open}
        onOpenChange={setOpen}
        onCheckDuplicates={(rows) =>
          checkSessionAttendanceDuplicates(
            occurrenceId,
            rows.map((r) => ({ email: r.email, phone: r.phone })),
          )
        }
        onImport={(rows) => importSessionAttendance(occurrenceId, rows)}
      />
    </>
  )
}
