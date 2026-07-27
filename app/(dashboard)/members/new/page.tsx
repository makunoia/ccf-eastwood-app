import type { Metadata } from "next"
import { db } from "@/lib/db"
import { MemberForm } from "../member-form"

export const metadata: Metadata = {
  title: "New Member",
}

export default async function NewMemberPage() {
  const ageRanges = await db.ageRangeBucket.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true },
  })
  return <MemberForm ageRanges={ageRanges} />
}
