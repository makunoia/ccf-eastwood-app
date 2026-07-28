import { Badge } from "@/components/ui/badge"
import type { ResponseRow } from "@/lib/forms/registration-responses"

/**
 * Read-only view of what this person told us at registration, filtered by what
 * the event's form actually asks for. Rows come from
 * `lib/forms/registration-responses.ts`, which owns the visibility rules.
 */
export function RegistrationResponsesSection({
  fieldRows,
  sectionRows,
}: {
  fieldRows: ResponseRow[]
  sectionRows: ResponseRow[]
}) {
  if (fieldRows.length === 0 && sectionRows.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h3 className="type-label text-muted-foreground">Registration responses</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          What this event&apos;s form collects. Configure it in Forms → Registration form.
        </p>
      </div>

      <dl className="divide-y rounded-lg border">
        {[...fieldRows, ...sectionRows].map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm"
          >
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {row.label}
              {!row.stillCollected && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  No longer asked
                </Badge>
              )}
            </dt>
            <dd className={row.value ? "text-right font-medium" : "text-right text-muted-foreground"}>
              {row.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
