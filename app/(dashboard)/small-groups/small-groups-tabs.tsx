"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

type Tab = "all" | "requests" | "seeking"

const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  requests: "Requests",
  // People who asked to join but have no group picked yet (CCF-101).
  seeking: "Seeking",
}

export function SmallGroupsTabs({
  pendingRequestCount,
  seekerCount,
}: {
  pendingRequestCount: number
  seekerCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = (searchParams.get("tab") as Tab) || "all"

  const badgeFor: Record<Tab, number> = {
    all: 0,
    requests: pendingRequestCount,
    seeking: seekerCount,
  }

  function switchTab(tab: Tab) {
    const params = new URLSearchParams()
    if (tab !== "all") params.set("tab", tab)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex border-b">
      {(["all", "requests", "seeking"] as Tab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => switchTab(tab)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === tab
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {TAB_LABEL[tab]}
          {badgeFor[tab] > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {badgeFor[tab]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
