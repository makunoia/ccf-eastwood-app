"use client"

import * as React from "react"
import Link from "next/link"
import { IconExternalLink } from "@tabler/icons-react"
import { toast } from "sonner"
import type { FormKey } from "@/app/generated/prisma/client"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FORM_REGISTRY } from "@/lib/forms/registry"
import { setFormOpen } from "./actions"

export type FormListRow = {
  key: FormKey
  label: string
  description: string
  href: string
  publicHref?: string
  checkinSessions?: { id: string; label: string; href: string }[]
  isOpen: boolean
}

const SECTION_ORDER = ["Registration & attendance", "Serving", "DGroup & member care"] as const

function sectionFor(key: FormKey) {
  if (["EventRegistration", "EventWalkIn", "EventCheckIn"].includes(key)) {
    return "Registration & attendance"
  }
  if (["VolunteerSignUp", "VolunteerInfo", "VolunteerApproval"].includes(key)) {
    return "Serving"
  }
  return "DGroup & member care"
}

function FormRow({ row, eventId }: { row: FormListRow; eventId: string | null }) {
  const [isOpen, setIsOpen] = React.useState(row.isOpen)
  const [pending, setPending] = React.useState(false)

  async function handleToggle(next: boolean) {
    setPending(true)
    setIsOpen(next)
    const result = await setFormOpen(row.key, eventId, next)
    setPending(false)
    if (result.success) {
      toast.success(next ? "Form opened" : "Form closed")
    } else {
      setIsOpen(!next)
      toast.error(result.error)
    }
  }

  const Icon = FORM_REGISTRY[row.key].icon
  const checkinSessions = row.checkinSessions ?? []
  const publicHref = checkinSessions.length === 1 ? checkinSessions[0].href : row.publicHref

  return (
    <li className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-12">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <Link
            href={row.href}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {row.label}
          </Link>
          <p className="mt-1 max-w-[58ch] text-sm leading-5 text-muted-foreground">{row.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8 sm:justify-end sm:pl-0 sm:pt-1">
        {checkinSessions.length > 1 ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                View <IconExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{row.label}</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Choose a check-in form</DialogTitle>
                <DialogDescription>
                  Select the session whose check-in form you want to open.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                {checkinSessions.map((session) => (
                  <a
                    key={session.id}
                    href={session.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {session.label}
                    <IconExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        ) : publicHref && (
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            View <IconExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only"> {row.label} (opens in a new tab)</span>
          </a>
        )}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {pending ? "Saving…" : isOpen ? "On" : "Off"}
        </span>
        <Switch
          checked={isOpen}
          onCheckedChange={handleToggle}
          disabled={pending}
          aria-label={`${isOpen ? "Turn off" : "Turn on"} public access for ${row.label}`}
        />
      </div>
    </li>
  )
}

export function FormsList({
  rows,
  eventId = null,
}: {
  rows: FormListRow[]
  eventId?: string | null
}) {
  const sections = SECTION_ORDER.map((title) => ({
    title,
    rows: rows.filter((row) => sectionFor(row.key) === title),
  })).filter((section) => section.rows.length > 0)

  return (
    <div className="flex max-w-5xl flex-col gap-7">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`form-section-${section.title}`}>
          <h2 id={`form-section-${section.title}`} className="mb-2 text-sm font-semibold text-foreground">
            {section.title}
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {section.rows.map((row) => (
              <FormRow key={row.key} row={row} eventId={eventId} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
