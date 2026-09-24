import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canExport, canWrite } from "@/lib/permissions"
import { getEffectiveFormConfig } from "@/lib/forms/context-config-server"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { RegistrantsClient } from "./registrants-client"

export const metadata: Metadata = {
  title: "Registrants",
}

export async function getEventRegistrants(
  id: string,
  search: string,
  typeFilter: string,
  paymentFilter: string,
  attendanceFilter: string,
  lifeStageFilter: string,
  genderFilter: string,
  ageRangeFilter: string,
  meetingPreferenceFilter: string,
) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      price: true,
      modules: { select: { type: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          memberId: true,
          guestId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          mobileNumber: true,
          isPaid: true,
          paymentReference: true,
          attendedAt: true,
          occurrenceAttendances: { select: { id: true } },
          createdAt: true,
          member: {
            select: {
              id: true, firstName: true, lastName: true, phone: true, email: true,
              lifeStageId: true, gender: true, ageRangeBucketId: true,
              birthMonth: true, birthYear: true, meetingPreference: true,
            },
          },
          guest: {
            select: {
              id: true, firstName: true, lastName: true, phone: true, email: true,
              lifeStageId: true, gender: true, ageRangeBucketId: true,
              birthMonth: true, birthYear: true, meetingPreference: true,
            },
          },
          baptismOptIn: { select: { id: true } },
        },
      },
    },
  })
  if (!event) return null

  let registrants = event.registrants

  // Type filter
  if (typeFilter === "member") {
    registrants = registrants.filter((r) => r.memberId !== null)
  } else if (typeFilter === "guest") {
    registrants = registrants.filter((r) => r.guestId !== null || (r.memberId === null && r.guestId === null))
  }

  if (paymentFilter === "paid") registrants = registrants.filter((r) => r.isPaid)
  else if (paymentFilter === "unpaid") registrants = registrants.filter((r) => !r.isPaid)

  if (attendanceFilter === "attended") {
    registrants = registrants.filter((r) => r.attendedAt !== null || r.occurrenceAttendances.length > 0)
  } else if (attendanceFilter === "not-attended") {
    registrants = registrants.filter((r) => r.attendedAt === null && r.occurrenceAttendances.length === 0)
  }

  const profileValue = (r: (typeof registrants)[number], key: "lifeStageId" | "gender" | "ageRangeBucketId" | "meetingPreference") =>
    r.member?.[key] ?? r.guest?.[key] ?? null
  if (lifeStageFilter) registrants = registrants.filter((r) => profileValue(r, "lifeStageId") === lifeStageFilter)
  if (genderFilter) registrants = registrants.filter((r) => profileValue(r, "gender") === genderFilter)
  if (ageRangeFilter) {
    const ageRange = await db.ageRangeBucket.findUnique({
      where: { id: ageRangeFilter },
      select: { minAge: true, maxAge: true },
    })
    registrants = ageRange
      ? registrants.filter((r) => {
          const profile = r.member ?? r.guest
          if (!profile) return false
          if (profile.ageRangeBucketId) return profile.ageRangeBucketId === ageRangeFilter
          if (profile.birthYear == null) return false
          const today = new Date()
          let age = today.getUTCFullYear() - profile.birthYear
          if (profile.birthMonth != null && today.getUTCMonth() + 1 < profile.birthMonth) age -= 1
          return (ageRange.minAge == null || age >= ageRange.minAge) &&
            (ageRange.maxAge == null || age <= ageRange.maxAge)
        })
      : registrants
  }
  if (meetingPreferenceFilter) {
    registrants = registrants.filter((r) => profileValue(r, "meetingPreference") === meetingPreferenceFilter)
  }

  // Search filter (name, phone, email)
  if (search) {
    const q = search.toLowerCase()
    registrants = registrants.filter((r) => {
      const name = r.member
        ? `${r.member.firstName} ${r.member.lastName}`
        : r.guest
        ? `${r.guest.firstName} ${r.guest.lastName}`
        : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? ""
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? ""
      return (
        name.toLowerCase().includes(q) ||
        phone.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q)
      )
    })
  }

  return { ...event, registrants }
}

export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const search = (sp.search as string) || ""
  const typeFilter = (sp.type as string) || ""
  const paymentFilter = (sp.payment as string) || ""
  const attendanceFilter = (sp.attendance as string) || ""
  const lifeStageFilter = (sp.lifeStage as string) || ""
  const genderFilter = (sp.gender as string) || ""
  const ageRangeFilter = (sp.ageRange as string) || ""
  const meetingPreferenceFilter = (sp.meetingPreference as string) || ""

  const [session, event, registerConfig, lifeStages, ageRanges] = await Promise.all([
    auth(),
    getEventRegistrants(id, search, typeFilter, paymentFilter, attendanceFilter, lifeStageFilter, genderFilter, ageRangeFilter, meetingPreferenceFilter),
    getEffectiveFormConfig(id, "Register"),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.ageRangeBucket.findMany({ orderBy: { order: "asc" }, select: { id: true, label: true } }),
  ])
  if (!event) notFound()

  // The Priced module is the single gate for payment: it decides both whether the
  // Register form collects a reference and whether the admin columns appear, so
  // the two can't disagree.
  const isPricedEvent = event.modules.some((m) => m.type === "Priced")
  const collectsPayment = registerConfig.sectionPayment

  const selectionEnabled = canWrite(session, "Events")

  return (
    <BatchSelectionProvider
      allIds={event.registrants.map((r) => r.id)}
      enabled={selectionEnabled}
    >
      <RegistrantsClient
        eventId={event.id}
        eventName={event.name}
        eventType={event.type}
        isPaidEvent={isPricedEvent}
        formIncludePayment={collectsPayment}
        canExport={canExport(session, "Events")}
        search={search}
        typeFilter={typeFilter}
        paymentFilter={paymentFilter}
        attendanceFilter={attendanceFilter}
        lifeStageFilter={lifeStageFilter}
        genderFilter={genderFilter}
        ageRangeFilter={ageRangeFilter}
        meetingPreferenceFilter={meetingPreferenceFilter}
        lifeStages={lifeStages}
        ageRanges={ageRanges}
        registrants={event.registrants.map((r) => ({
          ...r,
          attendedAt: r.attendedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </BatchSelectionProvider>
  )
}
