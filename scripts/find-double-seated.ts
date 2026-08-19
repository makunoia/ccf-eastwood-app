import { db } from "../lib/db"
import { personKeyFor } from "../lib/clusters/roster"

/**
 * Finds people holding more than one breakout seat within the same set of tables.
 *
 * `BreakoutGroupMember` is keyed by `registrantId`, and one person can hold
 * several `EventRegistrant` rows — a duplicate sign-up on one event, or one row
 * per member event under a Collab cluster. Until the seating guards were made
 * unconditional, two of those rows could each be seated, which put the same human
 * at two tables: counted twice on the Catch Mech dashboard, and confirmable into
 * two different DGroups by two different facilitators.
 *
 * Seats are compared WITHIN an owner (one event's standing tables, or one
 * cluster's tables for the day) — never across. A member who attends a ministry's
 * recurring event every week legitimately holds a standing seat there while also
 * sitting at a collab day's table; those are different sets and both are correct.
 *
 * Read-only by default. Pass --delete to keep the earliest seat per person per
 * owner and remove the rest. This reads DATABASE_URL at runtime, so it needs
 * `dotenv -e` — PRISMA_ENV_FILE only steers the Prisma CLI.
 *
 *   pnpm dotenv -e .env.preview -- tsx scripts/find-double-seated.ts
 *   pnpm dotenv -e .env.preview -- tsx scripts/find-double-seated.ts --delete
 */

/** Which set of tables a seat belongs to. Cluster tables have a null eventId. */
function ownerKeyOf(group: { eventId: string | null; clusterId: string | null }): string {
  return group.clusterId ? `cluster:${group.clusterId}` : `event:${group.eventId}`
}

async function main() {
  const shouldDelete = process.argv.includes("--delete")

  const seats = await db.breakoutGroupMember.findMany({
    orderBy: [{ assignedAt: "asc" }, { registrantId: "asc" }],
    select: {
      breakoutGroupId: true,
      registrantId: true,
      assignedAt: true,
      breakoutGroup: {
        select: { id: true, name: true, eventId: true, clusterId: true },
      },
      registrant: {
        select: {
          id: true,
          memberId: true,
          guestId: true,
          member: { select: { firstName: true, lastName: true } },
          guest: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  type Seat = (typeof seats)[number]
  const byPerson = new Map<string, Seat[]>()
  for (const seat of seats) {
    // An anonymous registrant keys to its own row, so it can never collide with
    // anyone else — exactly the behaviour we want from `personKeyFor` here.
    const key = `${ownerKeyOf(seat.breakoutGroup)}|${personKeyFor(seat.registrant)}`
    const bucket = byPerson.get(key)
    if (bucket) bucket.push(seat)
    else byPerson.set(key, [seat])
  }

  const duplicated = [...byPerson.entries()].filter(([, group]) => group.length > 1)

  if (duplicated.length === 0) {
    console.log("No double-seated people found.")
    return
  }

  console.log(`${duplicated.length} person/owner pair(s) hold more than one seat:\n`)
  for (const [key, group] of duplicated) {
    const person = group[0].registrant.member ?? group[0].registrant.guest
    const name = person ? `${person.firstName} ${person.lastName}` : "(anonymous registrant)"
    console.log(`  ${name} — ${key}`)
    group.forEach((seat, index) => {
      const verb = index === 0 ? "KEEP " : shouldDelete ? "DROP " : "extra"
      console.log(
        `    ${verb} ${seat.breakoutGroup.name} (registrant ${seat.registrantId}, seated ${seat.assignedAt.toISOString()})`
      )
    })
  }

  if (!shouldDelete) {
    console.log("\nRead-only. Re-run with --delete to keep the earliest seat of each pair.")
    return
  }

  // Ordered by assignedAt above, so index 0 is the earliest — the seat that keeps
  // whatever history (catch-mech requests, facilitator decisions) hangs off it.
  const toDrop = duplicated.flatMap(([, group]) => group.slice(1))
  let deleted = 0
  for (const seat of toDrop) {
    await db.breakoutGroupMember.delete({
      where: {
        breakoutGroupId_registrantId: {
          breakoutGroupId: seat.breakoutGroupId,
          registrantId: seat.registrantId,
        },
      },
    })
    deleted++
  }
  console.log(`\nRemoved ${deleted} duplicate seat(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
