"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { AgeRangeDialog } from "./age-range-dialog"

export function AgeRangesToolbar() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        Add Age Range
      </Button>
      <AgeRangeDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
