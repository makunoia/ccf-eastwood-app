import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function SmallGroupsToolbar() {
  return (
    <Button asChild>
      <Link href="/small-groups/new">
        <IconPlus />
        <span className="hidden sm:inline">Add Group</span>
      </Link>
    </Button>
  )
}
