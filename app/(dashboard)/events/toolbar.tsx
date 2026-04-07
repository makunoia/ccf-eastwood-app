import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function EventsToolbar() {
  return (
    <Button asChild>
      <Link href="/events/new">
        <IconPlus />
        <span className="hidden sm:inline">Add Event</span>
      </Link>
    </Button>
  )
}
