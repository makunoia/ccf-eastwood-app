import { db } from "../lib/db"

/**
 * Finds EventRegistrant rows that resolve to nobody: no memberId, no guestId,
 * and no personal name on the row itself.
 *
 * These were produced by the pre-cascade `EventRegistrant.memberId` foreign key
 * (ON DELETE SET NULL). Deleting a Member nulled the FK instead of removing the
 * registration, and for anyone promoted from a Guest the guestId had already
 * been moved onto memberId — so both FKs ended up null while the personal
 * columns, which are only written for registrants that never had an FK, stayed
 * empty. The result reads as "—" everywhere and inflates registrant counts.
 *
 * Read-only by default. Pass --delete to remove them. This reads DATABASE_URL at
 * runtime, so it needs `dotenv -e` — PRISMA_ENV_FILE only steers the Prisma CLI.
 *
 *   pnpm dotenv -e .env.preview -- tsx scripts/find-orphan-registrants.ts
 *   pnpm dotenv -e .env.preview -- tsx scripts/find-orphan-registrants.ts --delete
 *
 * A row is only reported when it has NO name of its own — a legitimately
 * anonymous registrant (name typed straight onto the row, both FKs null by
 * design) always carries firstName, so it is never matched here.
 */
async function main() {
  const shouldDelete = process.argv.includes("--delete")

  const orphans = await db.eventRegistrant.findMany({
    where: {
      memberId: null,
      guestId: null,
      OR: [{ firstName: null }, { firstName: "" }],
    },
    select: {
      id: true,
      createdAt: true,
      isPaid: true,
      paymentReference: true,
      attendedAt: true,
      event: { select: { name: true } },
      _count: { select: { occurrenceAttendances: true, breakoutGroupMemberships: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  if (orphans.length === 0) {
    console.log("No orphaned registrants found.")
    return
  }

  console.log(`${orphans.length} orphaned registrant(s):\n`)
  for (const o of orphans) {
    const history = [
      o.attendedAt ? "attended" : null,
      o._count.occurrenceAttendances > 0 ? `${o._count.occurrenceAttendances} session check-in(s)` : null,
      o._count.breakoutGroupMemberships > 0 ? "in a breakout group" : null,
      o.isPaid ? `paid (${o.paymentReference ?? "no reference"})` : null,
    ].filter(Boolean)

    console.log(
      `  ${o.id}  ${o.event.name}  registered ${o.createdAt.toISOString().slice(0, 10)}` +
        (history.length ? `\n      history: ${history.join(", ")}` : "")
    )
  }

  if (!shouldDelete) {
    console.log(
      "\nRead-only. Re-run with --delete to remove them.\n" +
        "Check the 'history' lines first: a row with attendance or payment on it is\n" +
        "still evidence someone was there, even though we can no longer say who."
    )
    return
  }

  const result = await db.eventRegistrant.deleteMany({
    where: { id: { in: orphans.map((o) => o.id) } },
  })
  console.log(`\nDeleted ${result.count} orphaned registrant(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
