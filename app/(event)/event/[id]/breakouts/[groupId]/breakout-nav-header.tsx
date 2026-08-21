"use client"

import { DetailPageHeader } from "@/components/detail-page-header"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"

type Props = {
  groupId: string
  /**
   * The workspace this group is being viewed in — `/event/<id>` or
   * `/cluster/<id>`. Taken from the surface rather than built from an event id,
   * because a Collab day's tables are owned by the cluster and have no event
   * (CCF-148); prev/next must stay inside whichever list the reader came from.
   */
  basePath: string
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
}

export function BreakoutNavHeader({ groupId, basePath, title, subtitle, action }: Props) {
  const { prev, next } = useListNavigation(groupId, "breakoutListIds")

  return (
    <DetailPageHeader
      title={title}
      subtitle={subtitle}
      action={action}
      prevHref={prev ? `${basePath}/breakouts/${prev}` : null}
      nextHref={next ? `${basePath}/breakouts/${next}` : null}
    />
  )
}
