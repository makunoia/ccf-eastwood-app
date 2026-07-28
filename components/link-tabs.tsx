"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Navigation rendered as a tab strip — for sibling list surfaces that live on
 * separate routes (e.g. Events ↔ Event Clusters). Active state comes from the
 * current pathname; `exact` pins a tab that is a prefix of its siblings.
 */
export function LinkTabs({
  tabs,
  className,
}: {
  tabs: { label: string; href: string; exact?: boolean }[]
  className?: string
}) {
  const pathname = usePathname()

  return (
    <div
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + "/")
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
