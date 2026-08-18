import Link from "next/link"
import { IconInfoCircle } from "@tabler/icons-react"

/**
 * Shown on a member event's own breakouts page when the event belongs to a Collab
 * cluster (CCF-148).
 *
 * The tables below are the event's *standing* ones. The collab day runs on the
 * cluster's own tables, which is the whole point of the reset — so without this
 * an admin would reasonably set up the groups here on the morning of the event
 * and find none of them in play. Deliberately a notice rather than a redirect:
 * the standing tables are still real, still editable, and still what this event
 * uses on any other day.
 */
export function ClusterBreakoutsNotice({
  clusterId,
  clusterName,
}: {
  clusterId: string
  clusterName: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="space-y-1">
        <p className="font-medium">Breakouts for this day run on {clusterName}</p>
        <p className="text-muted-foreground">
          This event is part of a collab. The day&apos;s breakout groups belong to the
          collab and are set up fresh for the session — the groups below are this
          event&apos;s own standing tables and are not used on the day.
        </p>
        <Link
          href={`/cluster/${clusterId}/breakouts`}
          className="inline-block font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          Go to {clusterName} breakouts
        </Link>
      </div>
    </div>
  )
}
