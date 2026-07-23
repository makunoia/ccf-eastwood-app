import Link from "next/link"
import { IconUsers } from "@tabler/icons-react"

import { GroupTypeBadge } from "@/components/group-type-badge"

type Props = {
  memberOf: {
    id: string
    name: string
    groupStatus: "Member" | "Timothy" | "Leader" | null
    groupType: "Regular" | "Couples"
  } | null
  ledGroups: {
    id: string
    name: string
    memberCount: number
    groupType: "Regular" | "Couples"
  }[]
}

export function MemberSmallGroups({ memberOf, ledGroups }: Props) {
  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <h3 className="type-label text-muted-foreground">Member Of</h3>
        {memberOf ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/small-groups/${memberOf.id}`}
                className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
              >
                {memberOf.name}
              </Link>
              <GroupTypeBadge groupType={memberOf.groupType} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not a member of any group
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="type-label text-muted-foreground">Leading</h3>
        {ledGroups.length > 0 ? (
          <div className="space-y-2">
            {ledGroups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/small-groups/${g.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {g.name}
                  </Link>
                  <GroupTypeBadge groupType={g.groupType} />
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <IconUsers className="size-3" />
                  {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not leading any groups</p>
        )}
      </section>
    </div>
  )
}
