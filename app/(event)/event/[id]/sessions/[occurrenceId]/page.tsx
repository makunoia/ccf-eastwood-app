import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { CheckCircle2, Repeat2, UserCheck, UserPlus, Users, XCircle } from "lucide-react"
import { db } from "@/lib/db"
import { isReturner } from "@/lib/session-stats"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { DetailPageHeader } from "@/components/detail-page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SessionAttendeesTable } from "./session-attendees-table"

async function getOccurrenceDetail(occurrenceId: string) {
  const occurrence = await db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          type: true,
          ministries: { include: { ministry: { select: { name: true } } } },
        },
      },
      attendees: {
        orderBy: { checkedInAt: "asc" },
        include: {
          registrant: {
            select: {
              id: true,
              memberId: true,
              guestId: true,
              member: { select: { firstName: true, lastName: true } },
              guest: { select: { firstName: true, lastName: true } },
              firstName: true,
              lastName: true,
              occurrenceAttendances: {
                select: {
                  occurrenceId: true,
                  occurrence: { select: { date: true } },
                },
              },
              breakoutGroupMemberships: {
                select: { breakoutGroupId: true },
              },
            },
          },
        },
      },
    },
  })

  if (!occurrence) return null

  const [volunteers, breakoutGroups] = await Promise.all([
    db.volunteer.findMany({
      where: { eventId: occurrence.event.id },
      select: { memberId: true },
    }),
    db.breakoutGroup.findMany({
      where: { eventId: occurrence.event.id },
      orderBy: { name: "asc" },
      include: {
        facilitator: {
          include: {
            member: {
              select: {
                firstName: true,
                lastName: true,
                eventRegistrations: {
                  where: { eventId: occurrence.event.id },
                  select: {
                    occurrenceAttendances: {
                      where: { occurrenceId },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
        coFacilitator: {
          include: {
            member: {
              select: {
                firstName: true,
                lastName: true,
                eventRegistrations: {
                  where: { eventId: occurrence.event.id },
                  select: {
                    occurrenceAttendances: {
                      where: { occurrenceId },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
        members: {
          include: {
            registrant: {
              select: {
                id: true,
                occurrenceAttendances: {
                  select: {
                    occurrenceId: true,
                    occurrence: { select: { date: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ])

  return { occurrence, volunteers, breakoutGroups }
}

function getAttendeeName(registrant: {
  memberId: string | null
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
  firstName: string | null
  lastName: string | null
}): string {
  if (registrant.member) return `${registrant.member.firstName} ${registrant.member.lastName}`
  if (registrant.guest) return `${registrant.guest.firstName} ${registrant.guest.lastName}`
  return `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim()
}

export default async function OccurrenceDetailPage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  const data = await getOccurrenceDetail(occurrenceId)
  if (!data || data.occurrence.event.id !== id) notFound()

  const { occurrence, volunteers, breakoutGroups } = data

  const dateLabel = occurrence.date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const volunteerMemberIds = new Set(volunteers.map((v) => v.memberId))

  const attendeesWithStats = occurrence.attendees.map((a) => ({
    id: a.id,
    name: getAttendeeName(a.registrant),
    checkedInAtFormatted: a.checkedInAt.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    }),
    isReturner: isReturner(a.registrant.occurrenceAttendances, occurrenceId, occurrence.date),
    isMember: !!a.registrant.memberId,
    isVolunteer: a.registrant.memberId
      ? volunteerMemberIds.has(a.registrant.memberId)
      : false,
    breakoutGroupIds: a.registrant.breakoutGroupMemberships.map((m) => m.breakoutGroupId),
  }))

  const totalCount = attendeesWithStats.length
  const newCount = attendeesWithStats.filter((a) => !a.isReturner).length
  const returneeCount = attendeesWithStats.filter((a) => a.isReturner).length
  const volunteersPresent = attendeesWithStats.filter((a) => a.isVolunteer).length

  const breakoutStats = breakoutGroups.map((bg) => {
    const facilitatorPresent =
      bg.facilitator?.member.eventRegistrations.some(
        (r) => r.occurrenceAttendances.length > 0,
      ) ?? false

    const coFacilitatorPresent =
      bg.coFacilitator?.member.eventRegistrations.some(
        (r) => r.occurrenceAttendances.length > 0,
      ) ?? false

    const checkedInMembers = bg.members.filter((m) =>
      m.registrant.occurrenceAttendances.some((a) => a.occurrenceId === occurrenceId),
    )

    const bgNewCount = checkedInMembers.filter(
      (m) => !isReturner(m.registrant.occurrenceAttendances, occurrenceId, occurrence.date),
    ).length

    const bgReturneeCount = checkedInMembers.filter((m) =>
      isReturner(m.registrant.occurrenceAttendances, occurrenceId, occurrence.date),
    ).length

    return {
      id: bg.id,
      name: bg.name,
      facilitatorName: bg.facilitator?.member
        ? `${bg.facilitator.member.firstName} ${bg.facilitator.member.lastName}`
        : null,
      facilitatorPresent,
      coFacilitatorName: bg.coFacilitator?.member
        ? `${bg.coFacilitator.member.firstName} ${bg.coFacilitator.member.lastName}`
        : null,
      coFacilitatorPresent,
      newCount: bgNewCount,
      returneeCount: bgReturneeCount,
      totalCheckedIn: checkedInMembers.length,
    }
  })

  const breakoutGroupOptions = breakoutGroups.map((bg) => ({ id: bg.id, name: bg.name }))

  return (
    <>
      <BreadcrumbOverride
        href={`/event/${id}/sessions/${occurrenceId}`}
        label={dateLabel}
      />
      <DetailPageHeader
        title={dateLabel}
        subtitle={
          <p className="text-sm text-muted-foreground">
            {occurrence.event.ministries.map((em) => em.ministry.name).join(" · ")}
            {occurrence.event.ministries.length > 0 && " · "}
            {totalCount} attended
          </p>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={totalCount} icon={<Users className="size-4" />} />
          <StatCard label="New" value={newCount} icon={<UserPlus className="size-4" />} />
          <StatCard label="Returnees" value={returneeCount} icon={<Repeat2 className="size-4" />} />
          <StatCard
            label="Volunteers"
            value={volunteersPresent}
            icon={<UserCheck className="size-4" />}
          />
        </div>

        <Tabs defaultValue="attendees">
          <TabsList variant="line">
            <TabsTrigger value="attendees" className="after:-bottom-px">
              Attendees
            </TabsTrigger>
            <TabsTrigger value="breakouts" className="after:-bottom-px">
              Breakout Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendees" className="mt-4">
            <SessionAttendeesTable
              occurrenceId={occurrenceId}
              attendees={attendeesWithStats}
              breakoutGroups={breakoutGroupOptions}
            />
          </TabsContent>

          <TabsContent value="breakouts" className="mt-4">
            {breakoutStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <p className="text-sm">No breakout groups configured for this event.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Group</th>
                      <th className="px-4 py-3 text-left font-medium">Facilitator</th>
                      <th className="px-4 py-3 text-left font-medium">Co-Facilitator</th>
                      <th className="px-4 py-3 text-right font-medium">New</th>
                      <th className="px-4 py-3 text-right font-medium">Returnees</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakoutStats.map((bg) => (
                      <tr key={bg.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{bg.name}</td>
                        <td className="px-4 py-3">
                          <PresenceCell name={bg.facilitatorName} present={bg.facilitatorPresent} />
                        </td>
                        <td className="px-4 py-3">
                          <PresenceCell
                            name={bg.coFacilitatorName}
                            present={bg.coFacilitatorPresent}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{bg.newCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{bg.returneeCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{bg.totalCheckedIn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground/40">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function PresenceCell({ name, present }: { name: string | null; present: boolean }) {
  if (!name) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-1.5">
      {present ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
      ) : (
        <XCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
      )}
      <span>{name}</span>
    </div>
  )
}
