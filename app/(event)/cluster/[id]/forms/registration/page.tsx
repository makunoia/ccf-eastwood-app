import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { db } from "@/lib/db"
import {
  getClusterFormConfigs,
  getClusterFormSuccessMessages,
} from "@/lib/forms/context-config-server"
import { PageHeader } from "@/components/page-header"
import { EventFormBuilder } from "@/components/forms/event-form-builder"
import { clusterFormPrerequisites } from "@/lib/forms/form-prerequisites-server"
import { ClusterFormSettings } from "../cluster-form-settings"

export const metadata: Metadata = {
  title: "Registration Form",
}

export default async function ClusterRegistrationFormPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      publicToken: true,
      isOpen: true,
      registrationStart: true,
      registrationEnd: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
    },
  })
  if (!cluster) notFound()

  const [configs, successMessages, prerequisites] = await Promise.all([
    getClusterFormConfigs(id),
    getClusterFormSuccessMessages(id),
    clusterFormPrerequisites(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/cluster/${id}/forms`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Forms
        </Link>
        <PageHeader
          title="Registration Form"
          description="The shared public form every event in this cluster uses"
        />
      </div>

      <ClusterFormSettings
        clusterId={id}
        clusterName={cluster.name}
        publicPath={`/register/c/${cluster.publicToken}`}
        initialIsOpen={cluster.isOpen}
        initialRegistrationStart={cluster.registrationStart?.toISOString() ?? null}
        initialRegistrationEnd={cluster.registrationEnd?.toISOString() ?? null}
        initialPage={{
          registrationPageTitle: cluster.registrationPageTitle ?? "",
          registrationPageDescription: cluster.registrationPageDescription ?? "",
          registrationPageBannerUrl: cluster.registrationPageBannerUrl ?? "",
          logoUrl: cluster.logoUrl ?? "",
          themeColorPrimary: cluster.themeColorPrimary ?? "",
        }}
      />

      <EventFormBuilder
        clusterId={id}
        initial={configs}
        contexts={["Register"]}
        heading="Registration form"
        blurb="What the public form asks for. Name, mobile number, and email are always collected; payment, breakout picking, and household capture aren't available on the shared form."
        notApplicable={["sectionPayment", "sectionBreakout", "sectionFamily", "familySpouseOnly"]}
        prerequisites={prerequisites}
        successMessages={successMessages}
        eventName={cluster.name}
      />
    </div>
  )
}
