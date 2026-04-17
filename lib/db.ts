import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

function buildConnectionString(host: string) {
  const { PGUSER, PGPASSWORD, PGDATABASE } = process.env
  return `postgresql://${PGUSER}:${PGPASSWORD}@${host}/${PGDATABASE}?sslmode=require`
}

function createPrismaClient() {
  const connectionString = buildConnectionString(process.env.PGHOST!)
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
