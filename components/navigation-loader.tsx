"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function NavigationLoader() {
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Navigation complete → hide loader
  useEffect(() => {
    clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false)
  }, [pathname, searchParams])

  // Detect navigation start via document click on anchor elements
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || !href.startsWith("/")) return
      if (anchor.target === "_blank") return
      // Strip query/hash to compare base paths
      const targetPath = href.split("?")[0].split("#")[0]
      if (targetPath === pathname) return

      timerRef.current = setTimeout(() => setLoading(true), 150)
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [pathname])

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  )
}
