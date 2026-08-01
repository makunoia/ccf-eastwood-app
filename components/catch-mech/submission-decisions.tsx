"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import type { SubmissionDecision } from "@/lib/catch-mech/stored-decisions"

/**
 * One person's outcome inside one Catch Mech submission — the same shape
 * whether a breakout facilitator or a volunteer submitted it, so both admin
 * pages render it identically.
 */
export type { SubmissionDecision }

const LINK_CLASS =
  "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

const STATUS_LABEL: Record<SubmissionDecision["status"], string> = {
  confirmed: "Confirmed",
  declined: "Declined",
  deferred: "No decision",
}

const STATUS_VARIANT: Record<SubmissionDecision["status"], "default" | "destructive" | "secondary"> =
  {
    confirmed: "default",
    declined: "destructive",
    deferred: "secondary",
  }

/**
 * The people one submission decided on.
 *
 * Rendered as a nested row rather than extra columns: a submission covers any
 * number of people, and the outcome detail — destination DGroup on a confirm,
 * reason on a decline — belongs beside each name. One facilitator can send two
 * people to two different groups and decline a third in the same sitting.
 */
export function SubmissionDecisions({
  decisions,
  canViewMember,
  canViewSmallGroup,
}: {
  decisions: SubmissionDecision[]
  canViewMember: boolean
  canViewSmallGroup: boolean
}) {
  if (decisions.length === 0) {
    return (
      <p className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
        This submission recorded no people — the form was submitted as-is.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-lg border bg-background">
      {decisions.map((decision, index) => (
        <li
          // Index-keyed: the submit side dedupes by registrant, but this reads
          // an unschema'd JSON blob, and a historical row with the same person
          // twice must render rather than collide. The list never reorders.
          key={`${decision.registrantId}-${index}`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            {canViewMember && decision.memberId ? (
              <Link href={`/members/${decision.memberId}`} className={`text-sm ${LINK_CLASS}`}>
                {decision.name}
              </Link>
            ) : (
              <span className="text-sm font-medium">{decision.name}</span>
            )}
            <Badge variant={STATUS_VARIANT[decision.status]}>
              {STATUS_LABEL[decision.status]}
            </Badge>
          </span>
          <DecisionDetail
            decision={decision}
            canViewSmallGroup={canViewSmallGroup}
          />
        </li>
      ))}
    </ul>
  )
}

/** The right-hand detail: where they went, or why they didn't. */
function DecisionDetail({
  decision,
  canViewSmallGroup,
}: {
  decision: SubmissionDecision
  canViewSmallGroup: boolean
}) {
  if (decision.status === "declined") {
    return (
      <span className="text-xs text-muted-foreground">
        {decision.declineReason ?? "No reason given"}
      </span>
    )
  }
  if (decision.status === "deferred") {
    return <span className="text-xs text-muted-foreground">Left for the admin to decide</span>
  }
  if (!decision.smallGroupName) {
    return <span className="text-xs text-muted-foreground">DGroup unavailable</span>
  }
  return canViewSmallGroup && decision.smallGroupId ? (
    <Link href={`/small-groups/${decision.smallGroupId}`} className={`text-xs ${LINK_CLASS}`}>
      {decision.smallGroupName}
    </Link>
  ) : (
    <span className="text-xs text-muted-foreground">{decision.smallGroupName}</span>
  )
}
