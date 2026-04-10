/**
 * Usage: DATABASE_URL=... pnpm tsx scripts/make-super-admin.ts <email>
 * Promotes the given user account to SuperAdmin role.
 */
import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const email = process.argv[2]
if (!email) {
  console.error("Usage: pnpm tsx scripts/make-super-admin.ts <email>")
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable")
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function main() {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No user found with email: ${email}`)
    process.exit(1)
  }

  await db.user.update({
    where: { email },
    data: { role: "SuperAdmin" },
  })

  console.log(`✓ ${email} is now SuperAdmin`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
