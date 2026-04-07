import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function MembersToolbar() {
  return (
    <Button asChild>
      <Link href="/members/new">
        <IconPlus />
        <span className="hidden sm:inline">Add Member</span>
      </Link>
    </Button>
  )
}
