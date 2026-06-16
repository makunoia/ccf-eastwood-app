"use client"

import { DetailPageHeader } from "@/components/detail-page-header"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"

type Props = {
  registrantId: string
  eventId: string
  initials: string
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
}

export function RegistrantNavHeader({ registrantId, eventId, initials, title, subtitle, action }: Props) {
  const { prev, next } = useListNavigation(registrantId, "registrantListIds")

  return (
    <DetailPageHeader
      initials={initials}
      title={title}
      subtitle={subtitle}
      action={action}
      prevHref={prev ? `/event/${eventId}/registrants/${prev}` : null}
      nextHref={next ? `/event/${eventId}/registrants/${next}` : null}
    />
  )
}
