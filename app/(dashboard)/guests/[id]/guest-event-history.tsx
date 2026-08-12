import Link from "next/link"
import { IconCheck, IconClock, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { resolveRegistrationAttendance } from "@/lib/events/registration-attendance"

type Registration = {
  id: string
  isPaid: boolean
  paymentReference: string | null
  attendedAt: Date | null
  _count: { occurrenceAttendances: number }
  event: {
    id: string
    name: string
    type: "OneTime" | "MultiDay" | "Recurring"
    startDate: Date
    endDate: Date
    price: number | null
    _count: { occurrences: number }
    ministries: { ministry: { name: string } }[]
  }
}

export function GuestEventHistory({
  registrations,
}: {
  registrations: Registration[]
}) {
  if (registrations.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No event registrations yet
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {registrations.map((r) => {
        const attendance = resolveRegistrationAttendance({
          eventType: r.event.type,
          endDate: r.event.endDate,
          attendedAt: r.attendedAt,
          attendedCount: r._count.occurrenceAttendances,
          occurrenceCount: r.event._count.occurrences,
        })

        return (
          <div
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <Link
                href={`/events/${r.event.id}`}
                className="text-sm font-medium hover:underline"
              >
                {r.event.name}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.event.ministries.map((em) => em.ministry.name).join(" · ")}
                {r.event.ministries.length > 0 ? " · " : ""}
                {r.event.startDate.toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.event.price != null && (
                <Badge
                  variant={r.isPaid ? "secondary" : "outline"}
                  className="gap-1"
                >
                  {r.isPaid ? (
                    <IconCheck className="size-3" />
                  ) : (
                    <IconX className="size-3" />
                  )}
                  {r.isPaid ? "Paid" : "Unpaid"}
                </Badge>
              )}
              <Badge
                variant={attendance.tone === "attended" ? "secondary" : "outline"}
                className="gap-1"
              >
                {attendance.tone === "attended" ? (
                  <IconCheck className="size-3" />
                ) : attendance.tone === "absent" ? (
                  <IconX className="size-3" />
                ) : (
                  <IconClock className="size-3" />
                )}
                {attendance.label}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}
