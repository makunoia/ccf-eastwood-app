"use client"

import * as React from "react"
import { IconCopy } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { PageAction } from "@/components/page-header"
import {
  BreakoutGroupsTable,
  type BreakoutGroupRow,
} from "@/app/(event)/event/[id]/breakouts/breakout-group"
import type { BreakoutSurface } from "@/lib/breakouts/owner"
import { CarryOverBreakoutsDialog } from "./carry-over-dialog"

type Volunteer = React.ComponentProps<typeof BreakoutGroupsTable>["volunteers"][number]

/**
 * A Collab day's Breakouts screen.
 *
 * Owns the carry-over trigger so it can sit in the table header's "⋯" menu beside
 * New Group rather than as a button floating in its own row above the table —
 * carry-over is a one-off setup utility, not something to keep in view once the
 * day has its tables.
 *
 * While the day is still empty the dashed prompt keeps its own button: that is the
 * moment where "carry a ministry's tables over" is the answer, and burying the only
 * route to it in a menu would hide it exactly when it is needed.
 */
export function ClusterBreakouts({
  clusterId,
  surface,
  breakoutGroups,
  registrantCount,
  unassignedCount,
  volunteers,
  lifeStages,
  events,
  canEdit,
}: {
  clusterId: string
  surface: BreakoutSurface
  breakoutGroups: BreakoutGroupRow[]
  registrantCount: number
  unassignedCount: number
  volunteers: Volunteer[]
  lifeStages: { id: string; name: string }[]
  events: { id: string; name: string }[]
  canEdit: boolean
}) {
  const [carryOverOpen, setCarryOverOpen] = React.useState(false)

  const extraActions: PageAction[] = canEdit
    ? [
        {
          label: "Carry over breakouts",
          icon: <IconCopy className="size-4" />,
          onSelect: () => setCarryOverOpen(true),
          overflow: true,
        },
      ]
    : []

  return (
    <>
      {canEdit && breakoutGroups.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">This day has no breakout groups yet</p>
            <p className="text-sm text-muted-foreground">
              Collab breakouts are set up fresh for the session. Add them below, or
              carry a ministry&apos;s existing tables over as a starting point.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCarryOverOpen(true)}>
            <IconCopy />
            Carry over breakouts
          </Button>
        </div>
      )}

      <BreakoutGroupsTable
        surface={surface}
        breakoutGroups={breakoutGroups}
        registrantCount={registrantCount}
        unassignedCount={unassignedCount}
        volunteers={volunteers}
        lifeStages={lifeStages}
        extraActions={extraActions}
      />

      {canEdit && (
        <CarryOverBreakoutsDialog
          clusterId={clusterId}
          events={events}
          open={carryOverOpen}
          onOpenChange={setCarryOverOpen}
        />
      )}
    </>
  )
}
