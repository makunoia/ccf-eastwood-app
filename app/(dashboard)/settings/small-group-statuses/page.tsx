import { db } from "@/lib/db"
import { type SmallGroupStatusRow } from "./columns"
import { SmallGroupStatusesTable } from "./small-group-statuses-table"
import { SmallGroupStatusesToolbar } from "./toolbar"

async function getStatuses(): Promise<SmallGroupStatusRow[]> {
  return db.smallGroupStatus.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true },
  })
}

export default async function SmallGroupStatusesPage() {
  const statuses = await getStatuses()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Small Group Statuses</h2>
          <p className="text-sm text-muted-foreground">
            Configure the integration stages used to track member progress in small groups
          </p>
        </div>
        <SmallGroupStatusesToolbar />
      </div>

      <SmallGroupStatusesTable statuses={statuses} />
    </div>
  )
}
