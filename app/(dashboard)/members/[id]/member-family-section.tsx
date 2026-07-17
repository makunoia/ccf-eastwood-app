import Link from "next/link"
import { IconHome } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FAMILY_ROLE_LABELS, type FamilyRoleValue } from "@/lib/validations/family"

export type MemberFamilyEntry = {
  familyId: string
  familyName: string
  role: FamilyRoleValue
  others: { name: string; role: FamilyRoleValue }[]
}

export function MemberFamilySection({
  families,
  canWrite,
}: {
  families: MemberFamilyEntry[]
  canWrite: boolean
}) {
  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <IconHome className="size-8" />
        <p className="text-sm">Not part of any family yet</p>
        {canWrite && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/families">Go to Families</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {families.map((f) => (
        <div key={f.familyId} className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/families/${f.familyId}`}
              className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              {f.familyName}
            </Link>
            <Badge variant="outline">{FAMILY_ROLE_LABELS[f.role]}</Badge>
          </div>
          {f.others.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {f.others.map((o, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>{o.name}</span>
                  <span className="text-muted-foreground">
                    {FAMILY_ROLE_LABELS[o.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
