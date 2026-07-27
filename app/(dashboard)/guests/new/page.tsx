import type { Metadata } from "next"
import { db } from "@/lib/db"
import { GuestForm } from "../guest-form"

export const metadata: Metadata = {
  title: "New Guest",
}

export default async function NewGuestPage() {
  const ageRanges = await db.ageRangeBucket.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true },
  })
  return <GuestForm ageRanges={ageRanges} />
}
