import Link from "next/link"
import { IconUsers } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"

type Props = {
  memberOf: {
    id: string
    name: string
    statusName: string | null
  } | null
  ledGroups: {
    id: string
    name: string
    memberCount: number
  }[]
}

export function MemberSmallGroups({ memberOf, ledGroups }: Props) {
  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Member Of</h3>
        {memberOf ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Link
              href={`/small-groups/${memberOf.id}`}
              className="text-sm font-medium hover:underline"
            >
              {memberOf.name}
            </Link>
            {memberOf.statusName && (
              <Badge variant="secondary">{memberOf.statusName}</Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not a member of any group
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Leading</h3>
        {ledGroups.length > 0 ? (
          <div className="space-y-2">
            {ledGroups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <Link
                  href={`/small-groups/${g.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {g.name}
                </Link>
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
