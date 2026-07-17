import type { Metadata } from "next"
import { Gender, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canExport, canImport, canWrite } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { BatchSelectionProvider } from "@/components/batch/batch-selection-provider"
import { BatchActionHeader } from "@/components/batch/batch-action-header"
import { type GuestRow } from "./columns"
import { GuestsTable } from "./guests-table"
import { GuestsFilters } from "./guests-filters"
import { GuestsToolbar } from "./guests-toolbar"
import { deleteGuestsBatch, setGuestsLifeStageBatch } from "./actions"

export const metadata: Metadata = {
  title: "Guests",
}

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
    nickname: g.nickname,
    email: g.email,
    phone: g.phone,
    lifeStage: g.lifeStage?.name ?? null,
    eventCount: g._count.eventRegistrations,
    dateAdded: g.createdAt.toISOString().split("T")[0],
    gender: g.gender,
    language: g.language,
    birthMonth: g.birthMonth,
    birthYear: g.birthYear,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    notes: g.notes,
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
              { nickname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      lifeStageId ? { lifeStageId } : {},
      gender ? { gender: gender as Gender } : {},
    ],
  }

  const [session, guests, lifeStages] = await Promise.all([
    auth(),
    getGuests(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  const writable = canWrite(session, "Guests")

  return (
    <BatchSelectionProvider allIds={guests.map((g) => g.id)} enabled={writable}>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <PageHeader
          title="Guests"
          description="Non-members who have attended events"
          actions={
            <BatchActionHeader
              entityLabel="guest"
              lifeStages={lifeStages}
              onDelete={deleteGuestsBatch}
              onSetLifeStage={setGuestsLifeStageBatch}
            >
              <GuestsToolbar
                guests={guests}
                canImport={canImport(session, "Guests")}
                canExport={canExport(session, "Guests")}
              />
            </BatchActionHeader>
          }
        />

        <GuestsFilters
          lifeStages={lifeStages}
          search={search}
          lifeStageId={lifeStageId}
          gender={gender}
        />

        <GuestsTable guests={guests} canWrite={writable} />
      </div>
    </BatchSelectionProvider>
  )
}
