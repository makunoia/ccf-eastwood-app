import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { FormClosed } from "@/components/form-closed"
import { PublicFormShell } from "@/components/public-form-shell"
import { getFormConfig, resolveFormTheme } from "@/lib/forms/config"
import { resolveEventBrand } from "@/lib/forms/event-brand"
import { VolunteerPlacementForm, type Participant } from "./volunteer-placement-form"

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
          registrants: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              memberId: true,
              guestId: true,
              member: { select: { firstName: true, lastName: true, smallGroupId: true } },
              guest: { select: { firstName: true, lastName: true, memberId: true } },
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

  const participants = session.event.registrants.flatMap((registrant): Participant[] => {
    if (registrant.memberId && registrant.member && !registrant.member.smallGroupId) {
      return [{
        id: registrant.id,
        name: `${registrant.member.firstName} ${registrant.member.lastName}`,
        kind: "Member",
      }]
    }
    if (registrant.guestId && registrant.guest && !registrant.guest.memberId) {
      return [{
        id: registrant.id,
        name: `${registrant.guest.firstName} ${registrant.guest.lastName}`,
        kind: "Guest",
      }]
    }
    return []
  })

  return {
    eventId: session.eventId,
    event: session.event,
    volunteerName: `${session.volunteer.member.firstName} ${session.volunteer.member.lastName}`,
    groups: session.volunteer.member.ledGroups,
    participants,
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
          participants={data.participants}
          groups={data.groups}
        />
      </div>
    </PublicFormShell>
  )
}
