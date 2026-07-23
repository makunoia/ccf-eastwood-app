import { IconHeart } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"

/** Rose "Couples" pill with a heart — the single source of truth for the
 *  small-group Couples tag across the app. */
export function CouplesBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={`gap-1 border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100 ${className ?? ""}`}
    >
      <IconHeart className="size-3" />
      Couples
    </Badge>
  )
}

/** Renders the Couples tag for a Couples group; nothing for a Regular group. */
export function GroupTypeBadge({
  groupType,
  className,
}: {
  groupType: "Regular" | "Couples" | null | undefined
  className?: string
}) {
  if (groupType !== "Couples") return null
  return <CouplesBadge className={className} />
}
