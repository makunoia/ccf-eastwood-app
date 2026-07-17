"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { PageActions } from "@/components/page-header"
import { FamilyFormDialog } from "./family-form-dialog"

export function FamiliesToolbar() {
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <PageActions
      primary={{
        label: "New Family",
        icon: <IconPlus />,
        onSelect: () => setCreateOpen(true),
      }}
    >
      <FamilyFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageActions>
  )
}
