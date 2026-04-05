import Link from "next/link"
import { IconCheck, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"

type Registration = {
  id: string
  isPaid: boolean
  paymentReference: string | null
  attendedAt: Date | null
  event: {
    id: string
    name: string
    startDate: Date
    price: number | null
    ministry: { name: string }
  }
}

export function MemberEventHistory({
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
      {registrations.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0">
            <Link
              href={`/events/${r.event.id}`}
              className="font-medium text-sm hover:underline"
            >
              {r.event.name}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.event.ministry.name} ·{" "}
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
              variant={r.attendedAt ? "secondary" : "outline"}
              className="gap-1"
            >
              {r.attendedAt ? (
                <IconCheck className="size-3" />
              ) : (
                <IconX className="size-3" />
              )}
              {r.attendedAt ? "Attended" : "Absent"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
