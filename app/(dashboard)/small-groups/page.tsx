import {
  GenderFocus,
  MeetingFormat,
  MemberRequestStatus,
  Prisma,
  SmallGroupStatus,
} from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canExport, canImport, canWrite } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { BatchActionHeader } from "@/components/batch/batch-action-header"
import { type SmallGroupRow } from "./columns"
import { SmallGroupsTable } from "./small-groups-table"
import { SmallGroupsToolbar } from "./toolbar"
import { SmallGroupsFilters } from "./small-groups-filters"
import { SmallGroupsTabs } from "./small-groups-tabs"
import { RequestsTable, type RequestRow } from "./requests-table"
import { deleteSmallGroupsBatch, setSmallGroupsLifeStageBatch } from "./actions"

async function getSmallGroups(where: Prisma.SmallGroupWhereInput): Promise<SmallGroupRow[]> {
  const groups = await db.smallGroup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStage: { select: { id: true, name: true } },
      _count: {
        select: {
          members: true,
          memberRequests: { where: { status: MemberRequestStatus.Pending } },
        },
      },
    },
  })

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    status: g.status as "Active" | "Pending" | "Inactive",
    leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
    leaderId: g.leader?.id ?? null,
    leaderFirstName: g.leader?.firstName ?? "",
    leaderLastName: g.leader?.lastName ?? "",
    leaderEmail: g.leader?.email ?? null,
    leaderPhone: g.leader?.phone ?? null,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    memberCount: g._count.members,
    tempMemberCount: g._count.memberRequests,
    lifeStage: g.lifeStage?.name ?? null,
    lifeStageId: g.lifeStageId,
    language: g.language,
    genderFocus: g.genderFocus,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
    scheduleTimeEnd: g.scheduleTimeEnd,
  }))
}

async function getPendingRequests(): Promise<RequestRow[]> {
  const requests = await db.smallGroupMemberRequest.findMany({
    where: { status: MemberRequestStatus.Pending },
    orderBy: { createdAt: "asc" },
    include: {
      guest: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      member: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      smallGroup: {
        select: {
          id: true,
          name: true,
          leader: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      },
      fromGroup: { select: { id: true, name: true } },
    },
  })

  return requests.map((r) => {
    const person = r.member ?? r.guest!
    const personType: "Member" | "Guest" = r.member ? "Member" : "Guest"
    return {
      id: r.id,
      createdAt: r.createdAt,
      notes: r.notes,
      personName: `${person.firstName} ${person.lastName}`,
      personType,
      personEmail: person.email ?? null,
      personPhone: person.phone ?? null,
      personId: person.id,
      isTransfer: r.fromGroupId !== null,
      fromGroupId: r.fromGroupId,
      fromGroupName: r.fromGroup?.name ?? null,
      targetGroupId: r.smallGroup.id,
      targetGroupName: r.smallGroup.name,
      leaderName: r.smallGroup.leader
        ? `${r.smallGroup.leader.firstName} ${r.smallGroup.leader.lastName}`
        : null,
      leaderId: r.smallGroup.leader?.id ?? null,
      leaderPhone: r.smallGroup.leader?.phone ?? null,
    }
  })
}

export default async function SmallGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const tab = (params.tab as string) || "all"
  const search = (params.search as string) || ""
  const lifeStageId = (params.lifeStageId as string) || ""
  const genderFocus = (params.genderFocus as string) || ""
  const meetingFormat = (params.meetingFormat as string) || ""
  const status = (params.status as string) || ""

  const where: Prisma.SmallGroupWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { leader: { firstName: { contains: search, mode: "insensitive" } } },
              { leader: { lastName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      lifeStageId ? { lifeStageId } : {},
      genderFocus ? { genderFocus: genderFocus as GenderFocus } : {},
      meetingFormat ? { meetingFormat: meetingFormat as MeetingFormat } : {},
      status ? { status: status as SmallGroupStatus } : {},
    ],
  }

  const [session, pendingRequestCount, groups, lifeStages, requests] = await Promise.all([
    auth(),
    db.smallGroupMemberRequest.count({ where: { status: MemberRequestStatus.Pending } }),
    tab === "all" ? getSmallGroups(where) : Promise.resolve([]),
    tab === "all"
      ? db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    tab === "requests" ? getPendingRequests() : Promise.resolve([]),
  ])

  const writable = canWrite(session, "SmallGroups")
  const selectionEnabled = writable && tab === "all"

  return (
    <BatchSelectionProvider
      allIds={groups.map((g) => g.id)}
      enabled={selectionEnabled}
    >
      <div className="flex flex-1 flex-col gap-4 p-6">
        <PageHeader
          title="Small Groups"
          description="Manage fellowship groups and their hierarchy"
          actions={
            tab === "all" ? (
              <BatchActionHeader
                entityLabel="small group"
                lifeStages={lifeStages}
                onDelete={deleteSmallGroupsBatch}
                onSetLifeStage={setSmallGroupsLifeStageBatch}
              >
                <SmallGroupsToolbar
                  groups={groups}
                  canImport={canImport(session, "SmallGroups")}
                  canExport={canExport(session, "SmallGroups")}
                />
              </BatchActionHeader>
            ) : undefined
          }
        />

        <SmallGroupsTabs pendingRequestCount={pendingRequestCount} />

        {tab === "requests" ? (
          <RequestsTable requests={requests} />
        ) : (
          <>
            <SmallGroupsFilters
              lifeStages={lifeStages}
              search={search}
              lifeStageId={lifeStageId}
              genderFocus={genderFocus}
              meetingFormat={meetingFormat}
              status={status}
            />
            <SmallGroupsTable groups={groups} canWrite={selectionEnabled} />
          </>
        )}
      </div>
    </BatchSelectionProvider>
  )
}
