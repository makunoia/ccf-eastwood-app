import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { buildCatchMechAttendance, type CatchMechAttendance } from "./attendance"

export async function loadCatchMechAttendance(eventId: string, client: Prisma.TransactionClient = db) {
  const event = await client.event.findUnique({
    where: { id: eventId },
    select: {
      type: true,
      occurrences: { select: { id: true, date: true } },
      registrants: {
        select: {
          id: true, memberId: true, guestId: true, createdAt: true, attendedAt: true,
          guest: { select: { memberId: true } },
          occurrenceAttendances: { select: { occurrenceId: true, occurrence: { select: { date: true } } } },
        },
      },
    },
  })
  return event ? buildCatchMechAttendance(event.type, event.registrants, event.occurrences) : new Map<string, CatchMechAttendance>()
}
