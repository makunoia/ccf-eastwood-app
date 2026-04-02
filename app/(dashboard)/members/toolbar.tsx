import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function MembersToolbar() {
  return (
    <Button asChild>
      <Link href="/members/new">
        <IconPlus />
        Add Member
      </Link>
    </Button>
  )
}
