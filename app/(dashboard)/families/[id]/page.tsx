import { notFound } from "next/navigation"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import type { FamilyRoleValue } from "@/lib/validations/family"
import { FamilyToolbar } from "./family-toolbar"
import { FamilyMembers, type FamilyMemberEntry } from "./family-members"

export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, family] = await Promise.all([
    auth(),
    db.family.findUnique({
      where: { id },
      include: {
        members: {
          select: {
            id: true,
            role: true,
            memberId: true,
            guestId: true,
            member: { select: { firstName: true, lastName: true } },
            guest: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ])

  if (!family) notFound()

  const writable = canWrite(session, "Members")

  const entries: FamilyMemberEntry[] = family.members.map((fm) => {
    const person = fm.member ?? fm.guest
    return {
      id: fm.id,
      role: fm.role as FamilyRoleValue,
      personName: person ? `${person.firstName} ${person.lastName}` : "Unknown",
      memberId: fm.memberId,
      guestId: fm.guestId,
    }
  })

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <BreadcrumbOverride href={`/families/${family.id}`} label={family.name} />

      <PageHeader
        title={family.name}
        description={family.notes ?? "Family household"}
        actions={
          writable ? (
            <FamilyToolbar
              family={{ id: family.id, name: family.name, notes: family.notes }}
            />
          ) : undefined
        }
      />

      <div className="max-w-2xl">
        <FamilyMembers familyId={family.id} entries={entries} canWrite={writable} />
      </div>
    </div>
  )
}
