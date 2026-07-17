import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { eventFormsForModules, scopeKeyFor } from "@/lib/forms/registry"
import { FormsList, type FormListRow } from "@/app/(dashboard)/forms/forms-list"

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
      modules: { select: { type: true } },
      formConfigs: { select: { scopeKey: true, isOpen: true } },
    },
  })
  if (!event) notFound()

  const modules = event.modules.map((m) => m.type)
  const openByScope = new Map(event.formConfigs.map((c) => [c.scopeKey, c.isOpen]))

  const rows: FormListRow[] = eventFormsForModules(modules).map((form) => ({
    key: form.key,
    label: form.label,
    description: form.description,
    href: `/event/${id}/forms/${form.key}`,
    isOpen: openByScope.get(scopeKeyFor(form.key, id)) ?? true,
    icon: form.icon,
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Forms"
        description="Manage public access and theming for this event's forms"
      />
      <FormsList rows={rows} />
    </div>
  )
}
