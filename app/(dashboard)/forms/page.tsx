import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { GLOBAL_FORMS, scopeKeyFor } from "@/lib/forms/registry"
import { FormsList, type FormListRow } from "./forms-list"

export default async function FormsPage() {
  const configs = await db.formConfig.findMany({
    where: { eventId: null },
    select: { scopeKey: true, isOpen: true },
  })
  const openByScope = new Map(configs.map((c) => [c.scopeKey, c.isOpen]))

  const rows: FormListRow[] = GLOBAL_FORMS.map((form) => ({
    key: form.key,
    label: form.label,
    description: form.description,
    href: `/forms/${form.key}`,
    isOpen: openByScope.get(scopeKeyFor(form.key)) ?? true,
    icon: form.icon,
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Forms"
        description="Manage public access and theming for your church-wide forms"
      />
      <FormsList rows={rows} />
    </div>
  )
}
