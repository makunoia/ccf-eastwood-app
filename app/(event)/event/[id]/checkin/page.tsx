import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { UserCheck, UserPlus, Users } from "lucide-react"
import { db } from "@/lib/db"
import { buildCheckinStats } from "@/lib/checkin-stats"
import { DetailPageHeader } from "@/components/detail-page-header"
import { StatCard } from "@/components/session-stat-card"
import { CheckinAttendeesTable } from "./checkin-attendees-table"
import { CopyCheckinLink } from "./copy-checkin-link"

export const metadata: Metadata = {
  title: "Check-in",
}

async function getCheckinData(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      type: true,
      startDate: true,
      ministries: { include: { ministry: { select: { name: true } } } },
    },
  })

  if (!event) return null

  const [attendedRegistrants, attendedVolunteers, eventVolunteers, totalRegistrants] =
    await Promise.all([
      db.eventRegistrant.findMany({
        where: { eventId, attendedAt: { not: null } },
        select: {
          id: true,
          memberId: true,
          firstName: true,
          lastName: true,
          attendedAt: true,
          member: { select: { firstName: true, lastName: true, gender: true } },
          guest: { select: { firstName: true, lastName: true, gender: true } },
        },
      }),
      db.volunteer.findMany({
        where: { eventId, attendedAt: { not: null } },
        select: {
          id: true,
          memberId: true,
          attendedAt: true,
          member: { select: { firstName: true, lastName: true, gender: true } },
        },
      }),
      db.volunteer.findMany({ where: { eventId }, select: { memberId: true } }),
      db.eventRegistrant.count({ where: { eventId } }),
    ])

  return { event, attendedRegistrants, attendedVolunteers, eventVolunteers, totalRegistrants }
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getCheckinData(id)
  // Check-in screen is OneTime-only — sessions handle MultiDay/Recurring attendance.
  if (!data || data.event.type !== "OneTime") notFound()

  const { event, attendedRegistrants, attendedVolunteers, eventVolunteers, totalRegistrants } = data

  const volunteerMemberIds = new Set(
    eventVolunteers
      .map((v) => v.memberId)
      .filter((memberId): memberId is string => memberId !== null),
  )

  const stats = buildCheckinStats(
    attendedRegistrants.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      member: r.member,
      guest: r.guest,
      firstName: r.firstName,
      lastName: r.lastName,
      attendedAt: r.attendedAt!,
    })),
    attendedVolunteers.map((v) => ({
      id: v.id,
      memberId: v.memberId,
      member: v.member,
      attendedAt: v.attendedAt!,
    })),
    volunteerMemberIds,
  )

  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")

  return (
    <>
      <DetailPageHeader
        title="Check-in"
        subtitle={
          <p className="text-sm text-muted-foreground">
            {ministryNames}
            {ministryNames && " · "}
            {dateLabel} · {stats.totalCount} of {totalRegistrants} checked in
          </p>
        }
        action={<CopyCheckinLink path={`/events/${event.id}/checkin`} />}
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total"
            value={stats.totalCount}
            icon={<Users className="size-4" />}
            genderBar={{ men: stats.menCount, women: stats.womenCount }}
          />
          <StatCard label="New" value={stats.newCount} icon={<UserPlus className="size-4" />} />
          <StatCard
            label="Participants"
            value={stats.participantCount}
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Volunteers"
            value={stats.volunteersPresent}
            icon={<UserCheck className="size-4" />}
          />
        </div>

        <CheckinAttendeesTable eventId={event.id} attendees={stats.rows} />
      </div>
    </>
  )
}
