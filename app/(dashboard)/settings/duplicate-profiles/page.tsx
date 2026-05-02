import Link from "next/link"
import { IconAlertTriangle } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { getDuplicateProfiles } from "./actions"

export default async function DuplicateProfilesPage() {
  const result = await getDuplicateProfiles()

  if (!result.success) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h2 className="type-headline">Duplicate Profiles</h2>
          <p className="text-sm text-muted-foreground">Phone and email addresses shared across Guest and Member records</p>
        </div>
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    )
  }

  const groups = result.data

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="type-headline">Duplicate Profiles</h2>
        <p className="text-sm text-muted-foreground">
          Phone and email addresses shared across Guest and Member records. Review and manually merge or correct as needed.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No duplicates found</p>
          <p className="mt-1 text-sm text-muted-foreground">All phone and email addresses are unique across Members and Guests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {groups.length} duplicate {groups.length === 1 ? "contact" : "contacts"} found
          </p>
          {groups.map((group, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="size-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium font-mono">{group.value}</span>
                <Badge variant="outline" className="text-xs">
                  {group.field === "phone" ? "Phone" : "Email"}
                </Badge>
              </div>
              <div className="divide-y rounded-md border">
                {group.records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Link
                        href={record.recordType === "member" ? `/members/${record.id}` : `/guests/${record.id}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {record.firstName} {record.lastName}
                      </Link>
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {record.recordType}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
