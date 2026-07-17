import type { Metadata } from "next"
import { db } from "@/lib/db"
import { EventForm } from "../event-form"

export const metadata: Metadata = {
  title: "New Event",
}

async function getMinistries() {
  return db.ministry.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

export default async function NewEventPage() {
  const ministries = await getMinistries()
  return <EventForm ministries={ministries} />
}
