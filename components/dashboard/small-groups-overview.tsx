import Link from "next/link"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type GroupRow = {
  id: string
  name: string
  memberLimit: number | null
  leader: { firstName: string; lastName: string }
  lifeStage: { name: string } | null
  _count: { members: number }
}

export function SmallGroupsOverview({
  groups,
  totalGroups,
}: {
  groups: GroupRow[]
  totalGroups: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Small Groups</CardTitle>
        <CardDescription>
          {totalGroups} group{totalGroups !== 1 ? "s" : ""} in the network
        </CardDescription>
        <CardAction>
          <Link
            href="/small-groups"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No small groups have been created yet.
          </p>
        ) : (
          <div className="divide-y">
            {groups.map((g) => {
              const capacity =
                g.memberLimit != null
                  ? `${g._count.members} / ${g.memberLimit}`
                  : `${g._count.members} member${g._count.members !== 1 ? "s" : ""}`

              return (
                <Link
                  key={g.id}
                  href={`/small-groups/${g.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-70 transition-opacity"
                >
                  <div>
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Led by {g.leader.firstName} {g.leader.lastName}
                      {g.lifeStage ? ` · ${g.lifeStage.name}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{capacity}</p>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
