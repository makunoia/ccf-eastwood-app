"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import type { FormKey } from "@/app/generated/prisma/client"
import { Switch } from "@/components/ui/switch"
import { SettingCard } from "@/components/ui/setting-card"
import { FORM_REGISTRY } from "@/lib/forms/registry"
import { setFormOpen } from "./actions"

export type FormListRow = {
  key: FormKey
  label: string
  description: string
  href: string
  isOpen: boolean
}

function FormRow({ row }: { row: FormListRow }) {
  const [isOpen, setIsOpen] = React.useState(row.isOpen)
  const [pending, setPending] = React.useState(false)

  async function handleToggle(next: boolean) {
    setPending(true)
    // Optimistic — revert on failure.
    setIsOpen(next)
    const result = await setFormOpen(row.key, null, next)
    setPending(false)
    if (result.success) {
      toast.success(next ? "Form opened" : "Form closed")
    } else {
      setIsOpen(!next)
      toast.error(result.error)
    }
  }

  return (
    <SettingCard
      icon={FORM_REGISTRY[row.key].icon}
      title={
        <Link
          href={row.href}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.label}
        </Link>
      }
      description={row.description}
      control={
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-12 text-right">
            {isOpen ? "Open" : "Closed"}
          </span>
          <Switch
            checked={isOpen}
            onCheckedChange={handleToggle}
            disabled={pending}
            aria-label={`${isOpen ? "Close" : "Open"} ${row.label}`}
          />
        </div>
      }
    />
  )
}

export function FormsList({ rows }: { rows: FormListRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <FormRow key={row.key} row={row} />
      ))}
    </div>
  )
}
