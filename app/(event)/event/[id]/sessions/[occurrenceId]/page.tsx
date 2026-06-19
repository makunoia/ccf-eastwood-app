import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { UserCheck, UserPlus, Users } from "lucide-react"
import { db } from "@/lib/db"
import { isEstablishedAttendee } from "@/lib/session-stats"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { DetailPageHeader } from "@/components/detail-page-header"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
              member: { select: { firstName: true, lastName: true, gender: true } },
              guest: { select: { firstName: true, lastName: true, gender: true } },
              firstName: true,
              lastName: true,
              occurrenceAttendances: {
                select: {
                  occurrenceId: true,
                  occurrence: { select: { date: true } },
                },
              },
              breakoutGroupMemberships: {
                select: {
                  breakoutGroupId: true,
                  breakoutGroup: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          volunteer: {
            select: {
              id: true,
              member: { select: { firstName: true, lastName: true, gender: true } },
            },
          },
        },
      },
    },
  })

  if (!occurrence) return null

  const [volunteers, breakoutGroups, subFacilitators, totalRegistrants] = await Promise.all([
    db.volunteer.findMany({
      where: { eventId: occurrence.event.id },
      select: {
        id: true,
        memberId: true,
        member: { select: { firstName: true, lastName: true } },
      },
    }),
    db.breakoutGroup.findMany({
      where: { eventId: occurrence.event.id },
      orderBy: { name: "asc" },
      include: {
        facilitator: {
          select: {
            // Facilitators are volunteers — presence comes from their own volunteer check-in.
            occurrenceAttendances: { where: { occurrenceId }, select: { id: true } },
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
          select: {
            occurrenceAttendances: { where: { occurrenceId }, select: { id: true } },
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
                memberId: true,
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
    db.occurrenceSubFacilitator.findMany({
      where: { occurrenceId },
      select: {
        breakoutGroupId: true,
        role: true,
        substituteId: true,
        substitute: { include: { member: { select: { firstName: true, lastName: true } } } },
      },
    }),
    db.eventRegistrant.count({ where: { eventId: occurrence.event.id } }),
  ])

  return { occurrence, volunteers, breakoutGroups, subFacilitators, totalRegistrants }
}

function getAttendeeName(registrant: {
  memberId: string | null
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
  firstName: string | null
  lastName: string | null
}): string | null {
  if (registrant.member) return `${registrant.member.firstName} ${registrant.member.lastName}`
  if (registrant.guest) return `${registrant.guest.firstName} ${registrant.guest.lastName}`
  return `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim() || null
}

export default async function OccurrenceDetailPage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  const data = await getOccurrenceDetail(occurrenceId)
  if (!data || data.occurrence.event.id !== id) notFound()

  const { occurrence, volunteers, breakoutGroups, subFacilitators } = data

  // A registrant may also be a volunteer for this event (registered + checked in via the
  // normal flow, or imported as session attendance). Cross-reference by member so those
  // attendees are recognized as volunteers rather than plain members.
  const volunteerMemberIds = new Set(
    volunteers.map((v) => v.memberId).filter((id): id is string => id !== null),
  )

  const dateLabel = occurrence.date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const attendeesWithStats = occurrence.attendees.map((a) => {
    const checkedInAtFormatted = a.checkedInAt.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    })

    // Volunteer attendance row — recorded directly against the Volunteer, not a registrant.
    if (a.volunteer) {
      return {
        id: a.id,
        kind: "volunteer" as const,
        subjectId: a.volunteer.id,
        name: `${a.volunteer.member.firstName} ${a.volunteer.member.lastName}`.trim() || null,
        checkedInAtFormatted,
        // Volunteers are established — never tagged "New".
        isReturner: true,
        isMember: true,
        isVolunteer: true,
        breakoutGroupIds: [] as string[],
        breakoutGroupNames: [] as string[],
        gender: a.volunteer.member.gender ?? null,
      }
    }

    const r = a.registrant!
    const isVolunteer = r.memberId ? volunteerMemberIds.has(r.memberId) : false
    return {
      id: a.id,
      kind: "registrant" as const,
      subjectId: r.id,
      name: getAttendeeName(r),
      checkedInAtFormatted,
      // Members and volunteers are established — never "New". Only first-time guests are tagged New.
      isReturner:
        isVolunteer ||
        isEstablishedAttendee(
          !!r.memberId,
          r.occurrenceAttendances,
          occurrenceId,
          occurrence.date,
        ),
      isMember: !!r.memberId,
      isVolunteer,
      breakoutGroupIds: r.breakoutGroupMemberships.map((m) => m.breakoutGroupId),
      breakoutGroupNames: r.breakoutGroupMemberships.map((m) => m.breakoutGroup.name),
      gender: r.member?.gender ?? r.guest?.gender ?? null,
    }
  })

  const totalCount = attendeesWithStats.length
  const newCount = attendeesWithStats.filter((a) => !a.isReturner).length
  const volunteersPresent = attendeesWithStats.filter((a) => a.isVolunteer).length
  const participantCount = totalCount - volunteersPresent
  const menCount = attendeesWithStats.filter((a) => a.gender === "Male").length
  const womenCount = attendeesWithStats.filter((a) => a.gender === "Female").length

  const breakoutStats = breakoutGroups.map((bg) => {
    // A facilitator is present if they checked in as a volunteer (current path) or,
    // for legacy data, via a linked registrant attendance.
    const facilitatorPresent =
      (bg.facilitator?.occurrenceAttendances.length ?? 0) > 0 ||
      (bg.facilitator?.member.eventRegistrations.some(
        (r) => r.occurrenceAttendances.length > 0,
      ) ?? false)

    const coFacilitatorPresent =
      (bg.coFacilitator?.occurrenceAttendances.length ?? 0) > 0 ||
      (bg.coFacilitator?.member.eventRegistrations.some(
        (r) => r.occurrenceAttendances.length > 0,
      ) ?? false)

    const subFac = subFacilitators.find(
      (s) => s.breakoutGroupId === bg.id && s.role === "Facilitator",
    )
    const subCoFac = subFacilitators.find(
      (s) => s.breakoutGroupId === bg.id && s.role === "CoFacilitator",
    )

    const checkedInMembers = bg.members.filter((m) =>
      m.registrant.occurrenceAttendances.some((a) => a.occurrenceId === occurrenceId),
    )

    // Members are established — never "New". Only first-time guests count as New.
    const bgReturnerFlags = checkedInMembers.map((m) =>
      isEstablishedAttendee(
        !!m.registrant.memberId,
        m.registrant.occurrenceAttendances,
        occurrenceId,
        occurrence.date,
      ),
    )

    const bgNewCount = bgReturnerFlags.filter((isRet) => !isRet).length
    const bgReturneeCount = bgReturnerFlags.filter((isRet) => isRet).length

    return {
      id: bg.id,
      name: bg.name,
      facilitatorName: bg.facilitator?.member
        ? `${bg.facilitator.member.firstName} ${bg.facilitator.member.lastName}`
        : null,
      facilitatorPresent,
      subFacilitatorId: subFac?.substituteId ?? null,
      subFacilitatorName: subFac
        ? `${subFac.substitute.member.firstName} ${subFac.substitute.member.lastName}`
        : null,
      coFacilitatorName: bg.coFacilitator?.member
        ? `${bg.coFacilitator.member.firstName} ${bg.coFacilitator.member.lastName}`
        : null,
      coFacilitatorPresent,
      subCoFacilitatorId: subCoFac?.substituteId ?? null,
      subCoFacilitatorName: subCoFac
        ? `${subCoFac.substitute.member.firstName} ${subCoFac.substitute.member.lastName}`
        : null,
      newCount: bgNewCount,
      returneeCount: bgReturneeCount,
      totalCheckedIn: checkedInMembers.length,
    }
  })

  const breakoutGroupOptions = breakoutGroups.map((bg) => ({ id: bg.id, name: bg.name }))

  const volunteerOptions = volunteers.map((v) => ({
    value: v.id,
    label: `${v.member.firstName} ${v.member.lastName}`,
  }))

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
          <StatCard
            label="Total"
            value={totalCount}
            icon={<Users className="size-4" />}
            genderBar={{ men: menCount, women: womenCount }}
          />
          <StatCard label="New" value={newCount} icon={<UserPlus className="size-4" />} />
          <StatCard
            label="Participants"
            value={participantCount}
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Volunteers"
            value={volunteersPresent}
            icon={<UserCheck className="size-4" />}
          />
        </div>

        <SessionAttendeesTable
          eventId={id}
          occurrenceId={occurrenceId}
          attendees={attendeesWithStats}
          breakoutGroups={breakoutGroupOptions}
          breakoutStats={breakoutStats}
          volunteerOptions={volunteerOptions}
        />
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  icon,
  genderBar,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  genderBar?: { men: number; women: number }
}) {
  const genderTotal = (genderBar?.men ?? 0) + (genderBar?.women ?? 0)
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg border px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground/40">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {genderBar && genderTotal > 0 && (
        <TooltipProvider>
          <div className="absolute bottom-0 left-0 right-0 flex h-1">
            {genderBar.men > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-default bg-blue-400 transition-colors hover:bg-blue-500"
                    style={{ flex: genderBar.men }}
                  />
                </TooltipTrigger>
                <TooltipContent>{genderBar.men} men</TooltipContent>
              </Tooltip>
            )}
            {genderBar.women > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-default bg-pink-400 transition-colors hover:bg-pink-500"
                    style={{ flex: genderBar.women }}
                  />
                </TooltipTrigger>
                <TooltipContent>{genderBar.women} women</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
