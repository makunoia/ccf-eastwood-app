import { Gender, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { type MemberRow } from "./columns"
import { MembersTable } from "./members-table"
import { MembersToolbar } from "./toolbar"
import { MembersFilters } from "./members-filters"

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

  const [members, lifeStages, smallGroups] = await Promise.all([
    getMembers(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.smallGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage church member records
          </p>
        </div>
        <MembersToolbar />
      </div>

      <MembersFilters
        key={`${search}-${lifeStageId}-${smallGroupId}-${gender}`}
        lifeStages={lifeStages}
        smallGroups={smallGroups}
        search={search}
        lifeStageId={lifeStageId}
        smallGroupId={smallGroupId}
        gender={gender}
      />

      <MembersTable members={members} />
    </div>
  )
}
