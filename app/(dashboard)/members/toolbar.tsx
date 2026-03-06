"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { MemberDialog } from "./member-dialog"

export function MembersToolbar({
  lifeStages,
}: {
  lifeStages: { id: string; name: string }[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        Add Member
      </Button>
      <MemberDialog open={open} onOpenChange={setOpen} lifeStages={lifeStages} />
    </>
  )
}
