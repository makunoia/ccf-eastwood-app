import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"

async function getOccurrence(occurrenceId: string) {
  return db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          type: true,
          ministries: { include: { ministry: { select: { name: true } } } },
        },
      },
      attendees: {
        orderBy: { checkedInAt: "asc" },
        include: {
          registrant: {
            select: {
              id: true,
              memberId: true,
              member: { select: { firstName: true, lastName: true } },
              guest: { select: { firstName: true, lastName: true } },
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  })
}

function attendeeName(registrant: {
  memberId: string | null
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
  firstName: string | null
  lastName: string | null
}): string {
  if (registrant.member) return `${registrant.member.firstName} ${registrant.member.lastName}`
  if (registrant.guest)  return `${registrant.guest.firstName} ${registrant.guest.lastName}`
  return `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim()
}

export default async function OccurrenceDetailPage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  const occurrence = await getOccurrence(occurrenceId)
  if (!occurrence || occurrence.event.id !== id) notFound()

  const dateLabel = occurrence.date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const eventType = occurrence.event.type
  const backLabel = eventType === "MultiDay" ? "Days" : "Sessions"

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href={`/event/${id}/sessions`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          {backLabel}
        </Link>
      </div>

      <div className="space-y-1">
        <h2 className="type-headline">{dateLabel}</h2>
        <p className="text-sm text-muted-foreground">
          {occurrence.event.ministries.map((em) => em.ministry.name).join(" · ")}
          {occurrence.event.ministries.length > 0 && " · "}
          {occurrence.attendees.length} attended
        </p>
      </div>

      {occurrence.attendees.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No one checked in for this session yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Checked in at</th>
              </tr>
            </thead>
            <tbody>
              {occurrence.attendees.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{attendeeName(a.registrant)}</td>
                  <td className="px-4 py-3">
                    {a.registrant.memberId
                      ? <Badge variant="secondary">Member</Badge>
                      : <Badge variant="outline">Guest</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.checkedInAt.toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
