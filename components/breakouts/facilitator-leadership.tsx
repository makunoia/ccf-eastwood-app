import Link from "next/link"

/**
 * Which DGroup a breakout group's facilitator leads — information, not a
 * setting. It used to be the source of the group's matching criteria; now it
 * only tells an admin who they're dealing with, and (where the facilitator
 * leads several) which DGroup Catch Mech requests are routed to is picked
 * separately on the detail page.
 *
 * A facilitator who leads nothing is a "Timothy": a DGroup is created for them
 * when their first member is confirmed, seeded from this breakout group's
 * profile — which is why that profile is required for them.
 */

export type LedGroup = { id: string; name: string }

export function FacilitatorLeadership({
  ledGroups,
  className = "text-xs text-muted-foreground",
  linkGroups = true,
}: {
  ledGroups: LedGroup[]
  className?: string
  /** Off inside an edit drawer, where navigating away would lose the form. */
  linkGroups?: boolean
}) {
  if (ledGroups.length === 0) {
    return <p className={className}>Does not lead a DGroup yet (Timothy)</p>
  }

  return (
    <p className={className}>
      Leads{" "}
      {ledGroups.map((g, i) => (
        <span key={g.id}>
          {i > 0 && ", "}
          {linkGroups ? (
            <Link
              href={`/small-groups/${g.id}`}
              className="font-medium text-foreground underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              {g.name}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{g.name}</span>
          )}
        </span>
      ))}
    </p>
  )
}
