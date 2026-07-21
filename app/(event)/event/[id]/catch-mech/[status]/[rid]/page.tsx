import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { db } from "@/lib/db"
import { registrantName, registrantNameSelect } from "@/lib/metadata"
import { findSpouseOfPerson } from "@/lib/family-links"
import { CatchMechDetailClient, type SpouseCardData } from "./catch-mech-detail-client"
import type { CatchMechActivityEntry } from "./catch-mech-activity-log"
import { SLUG_CONFIG, isCatchMechSlug } from "../../status-slug"

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
        declineReason: true,
        smallGroupId: true,
        smallGroup: {
          select: {
            id: true,
            name: true,
            groupType: true,
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
          performedByMember: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  if (!registrant) return null

  // ── Spouse (derived from Family data) ─────────────────────────────────────
  const spouse = registrant.memberId
    ? await findSpouseOfPerson({ memberId: registrant.memberId })
    : registrant.guestId
      ? await findSpouseOfPerson({ guestId: registrant.guestId })
      : null

  let spouseCard: SpouseCardData | null = null
  if (spouse) {
    const [spouseGroup, spousePendingRequest] = await Promise.all([
      spouse.smallGroupId
        ? db.smallGroup.findUnique({
            where: { id: spouse.smallGroupId },
            select: { id: true, name: true },
          })
        : null,
      db.smallGroupMemberRequest.findFirst({
        where: {
          status: "Pending",
          breakoutGroupId: { in: breakoutGroupIds },
          ...(spouse.memberId ? { memberId: spouse.memberId } : { guestId: spouse.guestId }),
        },
        select: {
          id: true,
          smallGroup: { select: { id: true, name: true } },
        },
      }),
    ])
    spouseCard = {
      name: `${spouse.firstName} ${spouse.lastName}`,
      isGuest: spouse.guestId !== null,
      currentGroupId: spouseGroup?.id ?? null,
      currentGroupName: spouseGroup?.name ?? null,
      pendingRequest: spousePendingRequest?.smallGroup
        ? {
            id: spousePendingRequest.id,
            smallGroupId: spousePendingRequest.smallGroup.id,
            smallGroupName: spousePendingRequest.smallGroup.name,
          }
        : null,
    }
  }

  return { registrant, request, lifeStages, smallGroupLogs, spouseCard }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; rid: string }>
}): Promise<Metadata> {
  const { id: eventId, rid } = await params
  const registrant = await db.eventRegistrant.findFirst({
    where: { id: rid, eventId },
    select: registrantNameSelect,
  })
  return { title: `${registrantName(registrant, "Registrant")} · Catch Mech` }
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

  if (!isCatchMechSlug(rawStatus)) notFound()
  const status = rawStatus

  const data = await getDetailData(registrantId, eventId, SLUG_CONFIG[status].prismaStatus)
  if (!data) notFound()

  const { registrant, request, lifeStages, smallGroupLogs, spouseCard } = data

  let name: string
  if (registrant.member) {
    name = `${registrant.member.firstName} ${registrant.member.lastName}`
  } else if (registrant.guest) {
    name = `${registrant.guest.firstName} ${registrant.guest.lastName}`
  } else {
    name = `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim() || "—"
  }

  const session = await auth()
  const canViewSmallGroup = canRead(session, "SmallGroups")

  // Only expose the top-level profile link if the user can access that feature area.
  const profileLink = registrant.memberId
    ? canRead(session, "Members")
      ? `/members/${registrant.memberId}`
      : null
    : registrant.guestId
    ? canRead(session, "Guests")
      ? `/guests/${registrant.guestId}`
      : null
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
      performedByMember: log.performedByMember,
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
      canViewSmallGroup={canViewSmallGroup}
      name={name}
      initialPrefs={initialPrefs}
      lifeStages={lifeStages}
      initialTab={initialTab}
      requestId={request?.id ?? null}
      activityEntries={activityEntries}
      spouseCard={spouseCard}
    />
  )
}
