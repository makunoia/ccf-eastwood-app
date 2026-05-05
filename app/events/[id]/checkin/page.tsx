import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "./checkin-board"

async function getEvent(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      ministries: {
        select: {
          ministry: {
            select: {
              name: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  })
}

function resolveLogoUrl(event: NonNullable<Awaited<ReturnType<typeof getEvent>>>) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry)
    return ministry?.ministry.logoUrl ?? null
  }
  return event.logoUrl ?? null
}

function CheckinHeader({ logoUrl, name, subtitle }: { logoUrl: string | null; name: string; subtitle: string }) {
  return (
    <div className="border-b px-4 py-4 flex items-center gap-3">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className="size-10 rounded-lg object-contain bg-muted p-0.5"
        />
      )}
      <div>
        <h1 className="text-lg font-semibold">{name}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const logoUrl = resolveLogoUrl(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const subtitle = `${ministryNames}${ministryNames ? " · " : ""}Check-in`

  if (event.type === "Recurring" || event.type === "MultiDay") {
    return (
      <div className="min-h-svh bg-background">
        <CheckinHeader logoUrl={logoUrl} name={event.name} subtitle={subtitle} />
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="font-medium text-sm">
            {event.type === "MultiDay" ? "Use the day check-in link" : "Use the session check-in link"}
          </p>
          <p className="text-sm text-muted-foreground">
            {event.type === "MultiDay"
              ? "Each day has its own check-in link. Copy it from the event page in the admin dashboard."
              : "Each session has its own check-in link. Copy it from the event page in the admin dashboard."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <CheckinHeader logoUrl={logoUrl} name={event.name} subtitle={subtitle} />
      <CheckinBoard eventId={event.id} occurrenceId={null} />
    </div>
  )
}
