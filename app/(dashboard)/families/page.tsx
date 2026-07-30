import type { Metadata } from "next"
import { Prisma } from "@/app/generated/prisma/client"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { allTokensMatch } from "@/lib/search/name-search"
import { PageHeader } from "@/components/page-header"
import { type FamilyRow } from "./columns"
import { FamiliesTable } from "./families-table"
import { FamiliesFilters } from "./families-filters"
import { FamiliesToolbar } from "./toolbar"

export const metadata: Metadata = {
  title: "Families",
}

const PARENT_ROLES = ["FatherHusband", "MotherWife", "Guardian"] as const

function personName(fm: {
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
}): string {
  const p = fm.member ?? fm.guest
  return p ? `${p.firstName} ${p.lastName}` : ""
}

async function getFamilies(where: Prisma.FamilyWhereInput): Promise<FamilyRow[]> {
  const families = await db.family.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      members: {
        select: {
          role: true,
          member: { select: { firstName: true, lastName: true } },
          guest: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return families.map((f) => ({
    id: f.id,
    name: f.name,
    notes: f.notes,
    parents: f.members
      .filter((m) => (PARENT_ROLES as readonly string[]).includes(m.role))
      .map(personName)
      .filter(Boolean)
      .join(", "),
    childCount: f.members.filter((m) => m.role === "Child").length,
    memberCount: f.members.length,
  }))
}

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""

  // Tokens are ANDed within each branch rather than across the whole family, so
  // "Maria Santos" needs one household member called that — not a Maria in the
  // family plus an unrelated Santos.
  const familyNameMatch = allTokensMatch(search, (token) => [
    { name: { contains: token, mode: "insensitive" as const } },
  ]) as Prisma.FamilyWhereInput | null
  const familyMemberMatch = allTokensMatch(search, (token) => [
    { member: { firstName: { contains: token, mode: "insensitive" as const } } },
    { member: { lastName: { contains: token, mode: "insensitive" as const } } },
    { guest: { firstName: { contains: token, mode: "insensitive" as const } } },
    { guest: { lastName: { contains: token, mode: "insensitive" as const } } },
  ]) as Prisma.FamilyMemberWhereInput | null

  const where: Prisma.FamilyWhereInput =
    familyNameMatch && familyMemberMatch
      ? { OR: [familyNameMatch, { members: { some: familyMemberMatch } }] }
      : {}

  const [session, families] = await Promise.all([auth(), getFamilies(where)])
  const writable = canWrite(session, "Members")

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Families"
        description="Track households — parents and their children"
        actions={writable ? <FamiliesToolbar /> : undefined}
      />

      <FamiliesFilters search={search} />

      <FamiliesTable families={families} canWrite={writable} />
    </div>
  )
}
