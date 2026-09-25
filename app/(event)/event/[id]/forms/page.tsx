import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { defaultIsOpen, eventFormsForModules, scopeKeyFor } from "@/lib/forms/registry"
import { FormsList, type FormListRow } from "@/app/(dashboard)/forms/forms-list"
import { formatOccurrenceDate } from "@/lib/format/occurrence"
import { isCheckinLive, utcToday } from "@/lib/events/checkin-link"

export const metadata: Metadata = {
  title: "Forms",
}

export default async function EventFormsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      modules: { select: { type: true } },
      formConfigs: { select: { scopeKey: true, isOpen: true } },
      occurrences: {
        orderBy: { date: "asc" },
        select: { id: true, date: true, isOpen: true },
      },
    },
  })
  if (!event) notFound()

  const modules = event.modules.map((m) => m.type)
  const openByScope = new Map(event.formConfigs.map((c) => [c.scopeKey, c.isOpen]))
  const today = utcToday()
  const checkinSessions = event.type === "OneTime" ? [] : event.occurrences
    .filter((occurrence) => isCheckinLive({ ...occurrence, today }))
    .map((occurrence) => ({
      id: occurrence.id,
      label: formatOccurrenceDate(occurrence.date),
      href: `/events/${id}/checkin/${occurrence.id}`,
    }))

  const rows: FormListRow[] = eventFormsForModules(modules).map((form) => ({
    key: form.key,
    label: form.label,
    description: form.description,
    href: `/event/${id}/forms/${form.key}`,
    publicHref: form.publicPath?.(id),
    checkinSessions: form.key === "EventCheckIn" && event.type !== "OneTime"
      ? checkinSessions
      : undefined,
    isOpen: openByScope.get(scopeKeyFor(form.key, id)) ?? defaultIsOpen(form.key),
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Forms"
        description="Manage public access and theming for this event's forms"
      />
      <FormsList rows={rows} eventId={id} />
    </div>
  )
}
