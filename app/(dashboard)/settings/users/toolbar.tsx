"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { UserDialog } from "./user-dialog"
import type { EventOption } from "./columns"

export function UsersToolbar({ events }: { events: EventOption[] }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        <span className="hidden sm:inline">Add User</span>
      </Button>
      <UserDialog open={open} onOpenChange={setOpen} events={events} />
    </>
  )
}
