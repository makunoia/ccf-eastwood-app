import { getDuplicateProfiles } from "./actions"
import { DuplicatesClient } from "./duplicates-client"

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="type-headline">Duplicate Profiles</h2>
        <p className="text-sm text-muted-foreground">
          Phone and email addresses shared across Guest and Member records. Pick the keeper for each group, then merge
          them in one batch — losing records&apos; event history will be preserved on the keeper.
        </p>
      </div>

      <DuplicatesClient groups={result.data} />
    </div>
  )
}
