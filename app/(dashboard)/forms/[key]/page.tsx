import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import type { FormKey } from "@/app/generated/prisma/client"
import { PageHeader } from "@/components/page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { FORM_REGISTRY } from "@/lib/forms/registry"
import { getFormConfig } from "@/lib/forms/config"
import { FormConfigEditor } from "../form-config-editor"

export default async function GlobalFormEditorPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const { key } = await params
  const meta = FORM_REGISTRY[key as FormKey]
  if (!meta || meta.scope !== "global") notFound()

  const cfg = await getFormConfig(meta.key)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <BreadcrumbOverride href={`/forms/${meta.key}`} label={meta.label} />
      <div className="flex flex-col gap-2">
        <Link
          href="/forms"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Forms
        </Link>
        <PageHeader title={meta.label} description={meta.description} />
      </div>

      <FormConfigEditor
        formKey={meta.key}
        eventId={null}
        initialIsOpen={cfg.isOpen}
        initialTheme={{
          title: cfg.title ?? "",
          description: cfg.description ?? "",
          logoUrl: cfg.logoUrl ?? "",
          bannerUrl: cfg.bannerUrl ?? "",
          primaryColor: cfg.primaryColor ?? "",
        }}
        themeFields={meta.themeFields}
        publicUrl={meta.publicPath?.()}
      />
    </div>
  )
}
