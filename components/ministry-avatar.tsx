import { cn } from "@/lib/utils"

export type MinistryBadge = {
  name: string
  logoUrl: string | null
}

/** Two initials from the ministry name, for ministries with no logo uploaded. */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * A ministry's logo, falling back to its initials.
 *
 * The fallback is what makes this worth sharing: a list where some ministries
 * have a logo and others render nothing reads as broken, whereas initials keep
 * every row the same shape. Extracted from `MinistryPicker` when the collab
 * registration form needed the same badge (CCF-148) — the admin picker and the
 * public form disagreeing about how a ministry looks would be its own small bug.
 *
 * A plain `<img>` rather than `next/image` on purpose: logo URLs are
 * admin-supplied and can point anywhere, while `next.config.ts` only whitelists
 * the R2 and images.ccfeastwood.app hosts. `next/image` throws on anything else,
 * which would take down the whole form over a logo.
 */
export function MinistryAvatar({
  ministry,
  className,
}: {
  ministry: MinistryBadge
  /** Sizing lives with the caller — the public form wants a bigger badge than the admin list. */
  className?: string
}) {
  const base = "size-8 shrink-0 rounded-md border bg-muted"

  if (ministry.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ministry.logoUrl}
        alt=""
        className={cn(base, "object-contain p-0.5", className)}
      />
    )
  }
  return (
    <div
      className={cn(
        base,
        "flex items-center justify-center text-[10px] font-medium text-foreground/60",
        className
      )}
      aria-hidden="true"
    >
      {initialsFor(ministry.name)}
    </div>
  )
}
