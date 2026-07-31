import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { FormClosed } from "@/components/form-closed"
import { PublicFormShell } from "@/components/public-form-shell"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { VolunteerPlacementForm } from "./volunteer-placement-form"

async function getSessionData(token: string) {
  const session = await db.catchMechVolunteerSession.findUnique({
    where: { token },
    select: {
      eventId: true,
      event: {
        select: {
          id: true,
          name: true,
          useMinistryBrand: true,
          brandMinistryId: true,
          logoUrl: true,
          themeColorPrimary: true,
          registrationPageBannerUrl: true,
          modules: { select: { type: true } },
          ministries: {
            select: {
              ministry: {
                select: { id: true, logoUrl: true, themeColorPrimary: true },
              },
            },
          },
        },
      },
      volunteer: {
        select: {
          status: true,
          member: {
            select: {
              firstName: true,
              lastName: true,
              ledGroups: {
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  })
  if (
    !session ||
    session.volunteer.status !== "Confirmed" ||
    !session.event.modules.some((module) => module.type === "CatchMech")
  ) {
    return null
  }

  // Participants are searched on demand rather than shipped with the page — an
  // event can have hundreds, and the volunteer only ever needs the handful they
  // absorbed. This count exists purely to decide between the search form and the
  // "everyone is already connected" empty state; the eligibility rule matches
  // `searchCatchMechVolunteerParticipants` so the two can never disagree.
  const eligibleCount = await db.eventRegistrant.count({
    where: {
      eventId: session.eventId,
      OR: [
        { member: { is: { smallGroupId: null } } },
        { guest: { is: { memberId: null } } },
      ],
    },
  })

  return {
    eventId: session.eventId,
    event: session.event,
    volunteerName: `${session.volunteer.member.firstName} ${session.volunteer.member.lastName}`,
    groups: session.volunteer.member.ledGroups,
    eligibleCount,
  }
}

export default async function CatchMechVolunteerPlacementPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>
}) {
  const { id, token } = await params
  const data = await getSessionData(token)
  if (!data || data.eventId !== id) notFound()

  const formConfig = await getFormConfig("CatchMech", id)
  if (!formConfig.isOpen) return <FormClosed />

  const brand = resolveEventBrand(data.event)
  const theme = resolveFormTheme(formConfig, {
    title: data.event.name,
    description: "Catch Mech volunteer follow-up",
    logoUrl: brand.logoUrl,
    bannerUrl: data.event.registrationPageBannerUrl ?? null,
    primaryColor: brand.primaryColor,
  })

  return (
    <PublicFormShell theme={theme} alt={data.event.name}>
      <div className="rounded-lg border bg-card p-6">
        <VolunteerPlacementForm
          token={token}
          volunteerName={data.volunteerName}
          hasEligibleParticipants={data.eligibleCount > 0}
          groups={data.groups}
        />
      </div>
    </PublicFormShell>
  )
}
