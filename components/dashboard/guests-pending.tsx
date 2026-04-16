import Link from "next/link"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type GuestRow = {
  id: string
  firstName: string
  lastName: string
  createdAt: Date
  _count: { eventRegistrations: number }
}

export function GuestsPending({
  guests,
  totalActiveGuests,
}: {
  guests: GuestRow[]
  totalActiveGuests: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests Awaiting Connection</CardTitle>
        <CardDescription>
          {totalActiveGuests} guest{totalActiveGuests !== 1 ? "s" : ""} not yet in a small group
        </CardDescription>
        <CardAction>
          <Link
            href="/guests"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {guests.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            All guests have been connected to small groups.
          </p>
        ) : (
          <div className="divide-y">
            {guests.map((g) => (
              <Link
                key={g.id}
                href={`/guests/${g.id}`}
                className="flex items-center justify-between py-3 hover:opacity-70 transition-opacity"
              >
                <div>
                  <p className="text-sm font-medium">
                    {g.firstName} {g.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g._count.eventRegistrations === 0
                      ? "No events attended"
                      : `${g._count.eventRegistrations} event${g._count.eventRegistrations !== 1 ? "s" : ""} attended`}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {g.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
