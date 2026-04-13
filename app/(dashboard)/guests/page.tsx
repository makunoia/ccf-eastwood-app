import { Gender, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { type GuestRow } from "./columns"
import { GuestsTable } from "./guests-table"
import { GuestsFilters } from "./guests-filters"
import { GuestsToolbar } from "./guests-toolbar"

async function getGuests(where: Prisma.GuestWhereInput): Promise<GuestRow[]> {
  const guests = await db.guest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      lifeStage: { select: { name: true } },
      _count: { select: { eventRegistrations: true } },
    },
  })

  return guests.map((g) => ({
    id: g.id,
    firstName: g.firstName,
    lastName: g.lastName,
    email: g.email,
    phone: g.phone,
    lifeStage: g.lifeStage?.name ?? null,
    eventCount: g._count.eventRegistrations,
    dateAdded: g.createdAt.toISOString().split("T")[0],
  }))
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const lifeStageId = (params.lifeStageId as string) || ""
  const gender = (params.gender as string) || ""

  const where: Prisma.GuestWhereInput = {
    AND: [
      { memberId: null },
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
      gender ? { gender: gender as Gender } : {},
    ],
  }

  const [guests, lifeStages] = await Promise.all([
    getGuests(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Guests</h2>
          <p className="text-sm text-muted-foreground">
            Non-members who have attended events
          </p>
        </div>
        <GuestsToolbar />
      </div>

      <GuestsFilters
        key={`${search}-${lifeStageId}-${gender}`}
        lifeStages={lifeStages}
        search={search}
        lifeStageId={lifeStageId}
        gender={gender}
      />

      <GuestsTable guests={guests} />
    </div>
  )
}
