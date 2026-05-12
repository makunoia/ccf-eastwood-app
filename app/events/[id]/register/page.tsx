import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { RegistrationForm } from "./registration-form"

async function getEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      endDate: true,
      price: true,
      registrationStart: true,
      registrationEnd: true,
      useMinistryBrand: true,
      brandMinistryId: true,
      logoUrl: true,
      themeColorPrimary: true,
      ministries: {
        select: {
          ministry: {
            select: {
              name: true,
              logoUrl: true,
              themeColorPrimary: true,
            },
          },
        },
      },
    },
  })
  return event ?? null
}

function resolveEventBrand(event: NonNullable<Awaited<ReturnType<typeof getEvent>>>) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry)
    return {
      logoUrl: ministry?.ministry.logoUrl ?? null,
      primaryColor: ministry?.ministry.themeColorPrimary ?? null,
    }
  }
  return {
    logoUrl: event.logoUrl ?? null,
    primaryColor: event.themeColorPrimary ?? null,
  }
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const isRecurring = event.type === "Recurring"
  const lifeStages = isRecurring
    ? await db.lifeStage.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      })
    : []

  const { logoUrl, primaryColor } = resolveEventBrand(event)
  const ministryNames = event.ministries.map((em) => em.ministry.name).join(" · ")
  const dateLabel = event.startDate.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  return (
    <div className="min-h-svh bg-muted">
      {/* Branded header band */}
      <div
        className={primaryColor ? "px-6 py-8 text-center" : "px-6 pt-12 pb-6 text-center"}
        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={event.name}
            className="mx-auto mb-4 size-20 rounded-xl object-contain"
            style={primaryColor ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
          />
        )}
        <h1 className={`text-2xl font-bold ${primaryColor ? "text-white" : ""}`}>{event.name}</h1>
        <p className={`mt-1 text-sm ${primaryColor ? "text-white/75" : "text-muted-foreground"}`}>
          {ministryNames}{ministryNames ? " · " : ""}{dateLabel}
        </p>
        {event.price != null && (
          <p className={`mt-1 text-sm font-medium ${primaryColor ? "text-white/90" : ""}`}>
            ₱
            {(event.price / 100).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}
          </p>
        )}
      </div>

      {/* Form area */}
      <div className="flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-md">
          <RegistrationForm eventId={event.id} isRecurring={isRecurring} lifeStages={lifeStages} />
        </div>
      </div>
    </div>
  )
}
