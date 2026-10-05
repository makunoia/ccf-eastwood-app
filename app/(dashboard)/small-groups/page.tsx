import type { Metadata } from "next"
import {
  MemberRequestStatus,
  Prisma,
  SmallGroupRequestOrigin,
} from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canExport, canImport, canWrite } from "@/lib/permissions"
import { dGroupFilterWhere, parseDGroupFilters } from "@/lib/small-groups/list-filters"
import {
  SEEKER_REQUEST_WHERE,
  countSeekerRequests,
} from "@/lib/small-groups/seeker-requests"
import { PageHeader } from "@/components/page-header"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { BatchActionHeader } from "@/components/batch/batch-action-header"
import { type SmallGroupRow } from "./columns"
import { SmallGroupsTable } from "./small-groups-table"
import { SmallGroupsToolbar } from "./toolbar"
import { SmallGroupsFilters } from "./small-groups-filters"
import { SmallGroupsTabs } from "./small-groups-tabs"
import { RequestsTable, type RequestRow } from "./requests-table"
import { RequestBatchActions } from "./request-batch-actions"
import { SeekersTable, type SeekerRow } from "./seekers-table"
import { deleteSmallGroupsBatch, setSmallGroupsLifeStageBatch } from "./actions"

export const metadata: Metadata = {
  title: "DGroups",
}

async function getSmallGroups(where: Prisma.SmallGroupWhereInput): Promise<SmallGroupRow[]> {
  const groups = await db.smallGroup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStages: { select: { id: true, name: true }, orderBy: { order: "asc" } },
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
    groupType: g.groupType as "Regular" | "Couples",
    leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
    leaderId: g.leader?.id ?? null,
    leaderFirstName: g.leader?.firstName ?? "",
    leaderLastName: g.leader?.lastName ?? "",
    leaderEmail: g.leader?.email ?? null,
    leaderPhone: g.leader?.phone ?? null,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    parentSatellite: g.parentSatellite,
    memberCount: g._count.members,
    tempMemberCount: g._count.memberRequests,
    lifeStages: g.lifeStages,
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

/**
 * People who asked to join a DGroup with no group picked yet (CCF-101). They can't
 * live in the Requests table — every column there is about the target group and a
 * seeker has none — so they get their own tab.
 */
async function getSeekers(): Promise<SeekerRow[]> {
  const requests = await db.smallGroupMemberRequest.findMany({
    where: SEEKER_REQUEST_WHERE,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      guest: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          smallGroup: { select: { id: true, name: true } },
        },
      },
      sourceEvent: { select: { id: true, name: true } },
    },
  })

  return requests.flatMap((r) => {
    const person = r.member ?? r.guest
    if (!person) return []
    return [
      {
        id: r.id,
        createdAt: r.createdAt,
        personName: `${person.firstName} ${person.lastName}`,
        personType: (r.member ? "Member" : "Guest") as SeekerRow["personType"],
        personId: person.id,
        personEmail: person.email ?? null,
        personPhone: person.phone ?? null,
        sourceEventId: r.sourceEvent?.id ?? null,
        sourceEventName: r.sourceEvent?.name ?? null,
        currentGroupId: r.member?.smallGroup?.id ?? null,
        currentGroupName: r.member?.smallGroup?.name ?? null,
      },
    ]
  })
}

async function getPendingRequests(): Promise<RequestRow[]> {
  const requests = await db.smallGroupMemberRequest.findMany({
    // Breakout/catch-mech placements set breakoutGroupId — those live in the event
    // workspace and on the group's own temp-member count, not this top-level tab.
    where: { status: MemberRequestStatus.Pending, smallGroupId: { not: null }, breakoutGroupId: null },
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

  return requests.flatMap((r) => {
    if (!r.smallGroup) return []
    const person = r.member ?? r.guest!
    const personType: "Member" | "Guest" = r.member ? "Member" : "Guest"
    return [{
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
    }]
  })
}

export default async function SmallGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const tab = (params.tab as string) || "all"
  const filters = parseDGroupFilters(params)
  const where = dGroupFilterWhere(filters)

  const [session, pendingRequestCount, seekerCount, groups, lifeStages, requests, seekers, filterGroups] =
    await Promise.all([
      auth(),
      db.smallGroupMemberRequest.count({
        where: {
          status: MemberRequestStatus.Pending,
          breakoutGroupId: null,
          // Seekers are Pending with no breakout too, but they're counted on their
          // own tab — badging them here would send admins to a table that can't
          // show them.
          origin: SmallGroupRequestOrigin.Assignment,
        },
      }),
      countSeekerRequests(),
      tab === "all" ? getSmallGroups(where) : Promise.resolve([]),
      tab === "all"
        ? db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } })
        : Promise.resolve([]),
      tab === "requests" ? getPendingRequests() : Promise.resolve([]),
      tab === "seeking" ? getSeekers() : Promise.resolve([]),
      tab === "all" ? db.smallGroup.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, locationCity: true, language: true, leader: { select: { id: true, firstName: true, lastName: true } } },
      }) : Promise.resolve([]),
    ])

  const writable = canWrite(session, "SmallGroups")
  // One provider, scoped to whichever tab is showing — the two tables select
  // different things (groups to delete vs. requests to settle) and a selection
  // must never survive a tab switch into rows it doesn't describe.
  const selectionEnabled = writable && (tab === "all" || tab === "requests")
  const selectableIds =
    tab === "requests" ? requests.map((r) => r.id) : groups.map((g) => g.id)

  return (
    <BatchSelectionProvider
      allIds={selectableIds}
      enabled={selectionEnabled}
    >
      <div className="flex flex-1 flex-col gap-4 p-6">
        <PageHeader
          title="DGroups"
          description="Manage fellowship groups and their hierarchy"
          actions={
            tab === "all" ? (
              <BatchActionHeader
                entityLabel="DGroup"
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
            ) : tab === "requests" ? (
              <RequestBatchActions />
            ) : undefined
          }
        />

        <SmallGroupsTabs
          pendingRequestCount={pendingRequestCount}
          seekerCount={seekerCount}
        />

        {tab === "requests" ? (
          <RequestsTable requests={requests} canWrite={writable} />
        ) : tab === "seeking" ? (
          <SeekersTable seekers={seekers} canWrite={writable} />
        ) : (
          <>
            <SmallGroupsFilters
              lifeStages={lifeStages}
              filters={filters}
              cities={[...new Set(filterGroups.flatMap((g) => g.locationCity ? [g.locationCity] : []))].sort((a, b) => a.localeCompare(b))}
              languages={[...new Set(filterGroups.flatMap((g) => g.language))].sort((a, b) => a.localeCompare(b))}
              parentGroups={filterGroups.map(({ id, name }) => ({ id, name }))}
              leaders={[...new Map(filterGroups.map((g) => [g.leader.id, { id: g.leader.id, name: `${g.leader.firstName} ${g.leader.lastName}` }])).values()].sort((a, b) => a.name.localeCompare(b.name))}
            />
            <SmallGroupsTable groups={groups} canWrite={selectionEnabled} />
          </>
        )}
      </div>
    </BatchSelectionProvider>
  )
}
