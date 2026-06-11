"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { LifeStageDialog } from "./life-stage-dialog"

export function LifeStagesToolbar() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        Add Life Stage
      </Button>
      <LifeStageDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
