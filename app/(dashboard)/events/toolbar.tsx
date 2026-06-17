import { IconPlus } from "@tabler/icons-react"

import { PageActions } from "@/components/page-header"

export function EventsToolbar() {
  return (
    <PageActions
      primary={{
        label: "Add Event",
        icon: <IconPlus />,
        href: "/events/new",
      }}
    />
  )
}
