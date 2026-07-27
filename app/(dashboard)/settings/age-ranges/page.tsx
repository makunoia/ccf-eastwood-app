import type { Metadata } from "next"
import { db } from "@/lib/db"
import { type AgeRangeRow } from "./columns"
import { AgeRangesTable } from "./age-ranges-table"
import { AgeRangesToolbar } from "./toolbar"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = {
  title: "Age Ranges · Settings",
}

async function getAgeRanges(): Promise<AgeRangeRow[]> {
  return db.ageRangeBucket.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true, minAge: true, maxAge: true, order: true },
  })
}

export default async function AgeRangesPage() {
  const buckets = await getAgeRanges()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Age Ranges"
        description="Configure the age brackets registration forms can offer. Birth year stays the source of truth for matching — a bracket is only used when birth year isn't collected."
        actions={<AgeRangesToolbar />}
      />

      <AgeRangesTable buckets={buckets} />
    </div>
  )
}
