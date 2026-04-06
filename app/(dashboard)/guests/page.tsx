import { db } from "@/lib/db"
import { type GuestRow } from "./columns"
import { GuestsTable } from "./guests-table"

async function getGuests(): Promise<GuestRow[]> {
  const guests = await db.guest.findMany({
    where: { memberId: null },
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

export default async function GuestsPage() {
  const guests = await getGuests()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h2 className="text-xl font-semibold">Guests</h2>
        <p className="text-sm text-muted-foreground">
          Non-members who have attended events
        </p>
      </div>
      <GuestsTable guests={guests} />
    </div>
  )
}
