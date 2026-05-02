import { notFound } from "next/navigation"

import { db } from "@/lib/db"
import { CatchMechDetailClient } from "./catch-mech-detail-client"
import type { CatchMechActivityEntry } from "./catch-mech-activity-log"

const VALID_STATUSES = ["confirmed", "rejected", "pending"] as const
type Status = (typeof VALID_STATUSES)[number]
const STATUS_PRISMA: Record<Status, "Confirmed" | "Rejected" | "Pending"> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}

async function getDetailData(registrantId: string, eventId: string, prismaStatus: "Confirmed" | "Rejected" | "Pending") {
  const eventBreakoutGroups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: { id: true },
  })
  const breakoutGroupIds = eventBreakoutGroups.map((bg) => bg.id)

  const [registrant, request, lifeStages, smallGroupLogs] = await Promise.all([
    db.eventRegistrant.findFirst({
      where: { id: registrantId, eventId },
      select: {
        id: true,
        memberId: true,
        guestId: true,
        firstName: true,
        lastName: true,
        mobileNumber: true,
        email: true,
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            notes: true,
            birthMonth: true,
            birthYear: true,
            lifeStageId: true,
            gender: true,
            language: true,
            workCity: true,
            workIndustry: true,
            meetingPreference: true,
          },
        },
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            address: true,
            dateJoined: true,
            notes: true,
            birthMonth: true,
            birthYear: true,
          },
        },
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: {
        status: prismaStatus,
        breakoutGroupId: { in: breakoutGroupIds },
        OR: [
          { guest: { eventRegistrations: { some: { id: registrantId } } } },
          { member: { eventRegistrations: { some: { id: registrantId } } } },
        ],
      },
      select: {
        id: true,
        notes: true,
        smallGroupId: true,
        smallGroup: {
          select: {
            id: true,
            name: true,
            leader: { select: { firstName: true, lastName: true } },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        },
      },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.smallGroupLog.findMany({
      where: {
        OR: [
          { guest: { eventRegistrations: { some: { id: registrantId } } } },
          { member: { eventRegistrations: { some: { id: registrantId } } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        description: true,
        createdAt: true,
        smallGroup: { select: { id: true, name: true } },
        performedByUser: { select: { name: true } },
      },
    }),
  ])

  if (!registrant) return null

  return { registrant, request, lifeStages, smallGroupLogs }
}

export default async function CatchMechDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; status: string; rid: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id: eventId, status: rawStatus, rid: registrantId } = await params
  const { tab } = await searchParams
  const initialTab = tab === "small-group" ? "small-group" : "details"

  if (!VALID_STATUSES.includes(rawStatus as Status)) notFound()
  const status = rawStatus as Status

  const data = await getDetailData(registrantId, eventId, STATUS_PRISMA[status])
  if (!data) notFound()

  const { registrant, request, lifeStages, smallGroupLogs } = data

  let name: string
  if (registrant.member) {
    name = `${registrant.member.firstName} ${registrant.member.lastName}`
  } else if (registrant.guest) {
    name = `${registrant.guest.firstName} ${registrant.guest.lastName}`
  } else {
    name = `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim() || "—"
  }

  const profileLink = registrant.memberId
    ? `/members/${registrant.memberId}`
    : registrant.guestId
    ? `/guests/${registrant.guestId}`
    : null

  const initialPrefs = {
    lifeStageId: registrant.guest?.lifeStageId ?? "",
    language: registrant.guest?.language ?? [],
    meetingPreference: registrant.guest?.meetingPreference ?? "",
    workCity: registrant.guest?.workCity ?? "",
    workIndustry: registrant.guest?.workIndustry ?? "",
  }

  const activityEntries: CatchMechActivityEntry[] = [
    ...smallGroupLogs.map((log) => ({
      kind: "smallGroupLog" as const,
      id: log.id,
      action: log.action,
      description: log.description,
      createdAt: log.createdAt,
      smallGroup: log.smallGroup,
      performedByUser: log.performedByUser,
    })),
    ...(request?.comments ?? []).map((c) => ({
      kind: "comment" as const,
      id: c.id,
      text: c.text,
      createdAt: c.createdAt,
      author: c.author,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return (
    <CatchMechDetailClient
      registrant={registrant}
      request={request}
      status={status}
      eventId={eventId}
      registrantId={registrantId}
      profileLink={profileLink}
      name={name}
      initialPrefs={initialPrefs}
      lifeStages={lifeStages}
      initialTab={initialTab}
      requestId={request?.id ?? null}
      activityEntries={activityEntries}
    />
  )
}
