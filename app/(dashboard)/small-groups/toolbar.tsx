"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SmallGroupDialog } from "./small-group-dialog"

export function SmallGroupsToolbar({
  members,
  smallGroups,
  lifeStages,
}: {
  members: { id: string; firstName: string; lastName: string }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        Add Group
      </Button>
      <SmallGroupDialog
        open={open}
        onOpenChange={setOpen}
        members={members}
        smallGroups={smallGroups}
        lifeStages={lifeStages}
      />
    </>
  )
}
