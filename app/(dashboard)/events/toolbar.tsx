import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function EventsToolbar() {
  return (
    <Button asChild>
      <Link href="/events/new">
        <IconPlus />
        Add Event
      </Link>
    </Button>
  )
}
