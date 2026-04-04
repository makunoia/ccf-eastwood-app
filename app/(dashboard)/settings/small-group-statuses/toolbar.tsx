"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SmallGroupStatusDialog } from "./small-group-status-dialog"

export function SmallGroupStatusesToolbar() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        Add Status
      </Button>
      <SmallGroupStatusDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
