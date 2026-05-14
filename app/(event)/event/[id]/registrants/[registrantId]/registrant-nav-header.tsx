"use client"

import { DetailPageHeader } from "@/components/detail-page-header"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"

type Props = {
  registrantId: string
  eventId: string
  initials: string
  title: string
  subtitle?: React.ReactNode
}

export function RegistrantNavHeader({ registrantId, eventId, initials, title, subtitle }: Props) {
  const { prev, next } = useListNavigation(registrantId, "registrantListIds")

  return (
    <DetailPageHeader
      initials={initials}
      title={title}
      subtitle={subtitle}
      prevHref={prev ? `/event/${eventId}/registrants/${prev}` : null}
      nextHref={next ? `/event/${eventId}/registrants/${next}` : null}
    />
  )
}
