import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { db } from "@/lib/db"
import { PageHeader } from "@/components/page-header"
import { CatchMechTable } from "./catch-mech-table"
import { WeeklyConfirmationsChart } from "./weekly-confirmations-chart"
import { buildWeeklyBuckets } from "./weekly-buckets"
import { buildCatchMechGroupRows } from "./aggregate"

export const metadata: Metadata = {
  title: "Catch Mech",
}

async function getCatchMechData(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      modules: { select: { type: true } },
      volunteers: {
        where: { status: "Confirmed" },
        select: { id: true },
      },
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          facilitatorId: true,
          // coFacilitatorId is needed only for the response tally — a co-faci gets
          // their own session and their own form, so they are a separate responder.
          coFacilitatorId: true,
          facilitator: {
            select: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  ledGroups: { select: { id: true, name: true }, orderBy: { name: "asc" } },
                },
              },
            },
          },
          members: {
            select: {
              registrant: {
                select: {
                  id: true,
                  memberId: true,
                  guestId: true,
                  member: { select: { firstName: true, lastName: true, smallGroupId: true } },
                  guest: { select: { firstName: true, lastName: true, memberId: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null

  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)

  // Fetch all requests for these breakout groups (single query)
  const allRequests = await db.smallGroupMemberRequest.findMany({
    where: { breakoutGroupId: { in: breakoutGroupIds } },
    select: {
      id: true,
      breakoutGroupId: true,
      memberId: true,
      guestId: true,
      status: true,
      declineReason: true,
      resolvedAt: true,
    },
  })

  // Weekly confirmation velocity (bucketing is pure — see weekly-buckets.ts)
  const weeklyBuckets = buildWeeklyBuckets(
    allRequests
      .filter((r) => r.status === "Confirmed" && r.resolvedAt)
      .map((r) => r.resolvedAt as Date)
  )

  // Build per-group rows + aggregate stats (pure, see aggregate.ts)
  const { groupRows, stats } = buildCatchMechGroupRows(event.breakoutGroups, allRequests)

  // Facilitator response rate — distinct responders over everyone expected to answer.
  // Counted from submissions, not sessions: a session exists as soon as a faci
  // verifies their mobile, which is not the same as answering the form.
  const submitted = await db.confirmationSubmission.findMany({
    where: { eventId, source: "CatchMech", facilitatorVolunteerId: { not: null } },
    select: { facilitatorVolunteerId: true },
    distinct: ["facilitatorVolunteerId"],
  })
  const expectedResponders = event.breakoutGroups.flatMap((bg) =>
    [bg.facilitatorId, bg.coFacilitatorId].filter((v): v is string => v !== null)
  )
  const respondedSet = new Set(submitted.map((s) => s.facilitatorVolunteerId))
  const response = {
    responded: expectedResponders.filter((v) => respondedSet.has(v)).length,
    expected: expectedResponders.length,
  }

  const volunteerSubmissions = await db.confirmationSubmission.findMany({
    where: { eventId, source: "CatchMechVolunteer", facilitatorVolunteerId: { not: null } },
    select: { facilitatorVolunteerId: true },
    distinct: ["facilitatorVolunteerId"],
  })
  const volunteerResponded = new Set(volunteerSubmissions.map((submission) => submission.facilitatorVolunteerId))
  const volunteerResponse = {
    responded: event.volunteers.filter((volunteer) => volunteerResponded.has(volunteer.id)).length,
    expected: event.volunteers.length,
  }

  return { groupRows, stats, weeklyBuckets, response, volunteerResponse }
}

/** Whole-number percentage, guarding a zero denominator. */
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

function CatchMechStatCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string
  value: number
  sub?: string
  color?: string
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
            {label}
          </p>
          <p className={`text-3xl font-semibold tabular-nums tracking-tight ${color ?? "text-foreground"}`}>
            {value}
          </p>
        </div>
        {href && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors shrink-0 mt-0.5" />
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </>
  )

  if (!href) {
    return <div className="rounded-lg border px-5 py-4 flex flex-col justify-between">{body}</div>
  }

  return (
    <Link
      href={href}
      className="group rounded-lg border px-5 py-4 flex flex-col justify-between hover:bg-muted/60 hover:border-foreground/20 hover:shadow-sm transition-all"
    >
      {body}
    </Link>
  )
}

export default async function CatchMechAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getCatchMechData(id)
  if (!data) notFound()

  const { groupRows, stats, weeklyBuckets, response, volunteerResponse } = data

  const session = await auth()
  const canViewMember = canRead(session, "Members")

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Catch Mech"
        description="Track small group confirmations from breakout groups"
      />

      {/* Confirmed/Rejected/Pending are measured against the matchable pool — the
          people catch mech is actually trying to place — so the three sum to 100%.
          In Small Group is measured against the full cohort instead: it's the share
          who were never candidates. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <CatchMechStatCard
          label="To Match"
          value={stats.matchable}
          sub={`of ${stats.totalCohort} total`}
        />
        <CatchMechStatCard
          label="Confirmed"
          value={stats.totalConfirmed}
          sub={`${pct(stats.totalConfirmed, stats.matchable)}% of to match`}
          color="text-green-600"
          href={`/event/${id}/catch-mech/confirmed`}
        />
        <CatchMechStatCard
          label="Rejected"
          value={stats.totalRejected}
          sub={`${pct(stats.totalRejected, stats.matchable)}% of to match`}
          color="text-red-600"
          href={`/event/${id}/catch-mech/rejected`}
        />
        <CatchMechStatCard
          label="In Small Group"
          value={stats.totalInSmallGroup}
          sub={`${pct(stats.totalInSmallGroup, stats.totalCohort)}% of all ${stats.totalCohort}`}
          color="text-sky-600"
          href={`/event/${id}/catch-mech/in-small-group`}
        />
        <CatchMechStatCard
          label="Pending"
          value={stats.totalPending}
          sub={`${pct(stats.totalPending, stats.matchable)}% of to match`}
          color="text-amber-600"
          href={`/event/${id}/catch-mech/pending`}
        />
        <CatchMechStatCard
          label="Responded"
          value={response.responded}
          sub={`of ${response.expected} facilitators`}
          color="text-violet-600"
          href={`/event/${id}/catch-mech/submissions`}
        />
        <CatchMechStatCard
          label="Volunteer Follow-up"
          value={volunteerResponse.responded}
          sub={`of ${volunteerResponse.expected} volunteers`}
          color="text-violet-600"
          href={`/event/${id}/catch-mech/volunteers`}
        />
      </div>

      <WeeklyConfirmationsChart
        buckets={weeklyBuckets}
        totalConfirmed={stats.totalConfirmed}
      />

      {/* Per-group table */}
      <section className="space-y-3">
        <h3 className="type-label text-muted-foreground">Breakout Groups</h3>
        <CatchMechTable groupRows={groupRows} canViewMember={canViewMember} eventId={id} />
      </section>
    </div>
  )
}
