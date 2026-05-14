"use client"

import { DetailPageHeader } from "@/components/detail-page-header"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"

type Props = {
  groupId: string
  eventId: string
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
}

export function BreakoutNavHeader({ groupId, eventId, title, subtitle, action }: Props) {
  const { prev, next } = useListNavigation(groupId, "breakoutListIds")

  return (
    <DetailPageHeader
      title={title}
      subtitle={subtitle}
      action={action}
      prevHref={prev ? `/event/${eventId}/breakouts/${prev}` : null}
      nextHref={next ? `/event/${eventId}/breakouts/${next}` : null}
    />
  )
}
