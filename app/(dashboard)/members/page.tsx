import { Gender, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canExport, canImport, canWrite } from "@/lib/permissions"
import { type MemberRow } from "./columns"
import { PageHeader } from "@/components/page-header"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { BatchActionHeader } from "@/components/batch/batch-action-header"
import { MembersTable } from "./members-table"
import { MembersToolbar } from "./toolbar"
import { MembersFilters } from "./members-filters"
import { deleteMembersBatch, setMembersLifeStageBatch } from "./actions"

async function getMembers(where: Prisma.MemberWhereInput): Promise<MemberRow[]> {
  const members = await db.member.findMany({
    where,
    orderBy: { dateJoined: "desc" },
    include: {
      lifeStage: { select: { id: true, name: true } },
      smallGroup: { select: { name: true } },
    },
  })

  return members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    nickname: m.nickname,
    email: m.email,
    phone: m.phone,
    smallGroupName: m.smallGroup?.name ?? null,
    lifeStage: m.lifeStage?.name ?? null,
    dateJoined: m.dateJoined.toISOString().split("T")[0],
    address: m.address,
    notes: m.notes,
    lifeStageId: m.lifeStageId,
    gender: m.gender,
    language: m.language,
    birthMonth: m.birthMonth,
    birthYear: m.birthYear,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
  }))
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const lifeStageId = (params.lifeStageId as string) || ""
  const smallGroupId = (params.smallGroupId as string) || ""
  const gender = (params.gender as string) || ""

  const where: Prisma.MemberWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { nickname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      lifeStageId ? { lifeStageId } : {},
      smallGroupId ? { smallGroupId } : {},
      gender ? { gender: gender as Gender } : {},
    ],
  }

  const [session, members, lifeStages, smallGroups] = await Promise.all([
    auth(),
    getMembers(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.smallGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  const writable = canWrite(session, "Members")

  return (
    <BatchSelectionProvider allIds={members.map((m) => m.id)} enabled={writable}>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <PageHeader
          title="Members"
          description="Manage church member records"
          actions={
            <BatchActionHeader
              entityLabel="member"
              lifeStages={lifeStages}
              onDelete={deleteMembersBatch}
              onSetLifeStage={setMembersLifeStageBatch}
            >
              <MembersToolbar
                members={members}
                canImport={canImport(session, "Members")}
                canExport={canExport(session, "Members")}
              />
            </BatchActionHeader>
          }
        />

        <MembersFilters
          lifeStages={lifeStages}
          smallGroups={smallGroups}
          search={search}
          lifeStageId={lifeStageId}
          smallGroupId={smallGroupId}
          gender={gender}
        />

        <MembersTable members={members} canWrite={writable} />
      </div>
    </BatchSelectionProvider>
  )
}
