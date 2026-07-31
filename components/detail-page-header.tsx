"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

type DetailPageHeaderProps = {
  prevHref?: string | null
  nextHref?: string | null
  initials?: string
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  status?: React.ReactNode
  tabs?: React.ReactNode
  /** Paints a soft, slowly-breathing light-pink glow along the bottom of the
   *  header — the ambient cue for Couples small groups (replaces a pill badge). */
  couplesAccent?: boolean
}

/** Hand-tuned so the drift never syncs up and the hearts stay off the title. */
const COUPLES_HEARTS = [
  { left: "6%", size: 11, delay: "0s", duration: "10s", drift: "14px", peak: 0.45 },
  { left: "23%", size: 8, delay: "2.5s", duration: "13s", drift: "-10px", peak: 0.3 },
  { left: "48%", size: 13, delay: "5s", duration: "11s", drift: "16px", peak: 0.4 },
  { left: "67%", size: 9, delay: "1s", duration: "14s", drift: "-8px", peak: 0.35 },
  { left: "84%", size: 12, delay: "6.5s", duration: "9s", drift: "12px", peak: 0.45 },
  { left: "93%", size: 7, delay: "3.5s", duration: "12s", drift: "-13px", peak: 0.28 },
] as const

function CouplesHearts() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {COUPLES_HEARTS.map((h, i) => (
        <div
          key={i}
          className="absolute inset-y-0"
          style={
            {
              left: h.left,
              "--heart-delay": h.delay,
              "--heart-duration": h.duration,
              "--heart-drift": h.drift,
              "--heart-peak": h.peak,
            } as React.CSSProperties
          }
        >
          {/* Full-height track carries the rise; the heart only sways inside it. */}
          <div className="couples-heart-track flex h-full items-end">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="couples-heart text-rose-400 dark:text-rose-300"
              style={{ width: h.size, height: h.size }}
            >
              <path d="M12 21s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9Z" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailPageHeader({
  prevHref,
  nextHref,
  initials,
  title,
  subtitle,
  action,
  status,
  tabs,
  couplesAccent,
}: DetailPageHeaderProps) {
  const router = useRouter()

  return (
    <div className="relative overflow-hidden border-b">
      {couplesAccent && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-in fade-in duration-1000"
        >
          <div className="couples-accent-breathe h-full w-full bg-linear-to-br from-rose-200/50 via-rose-100/20 via-30% to-transparent to-60% dark:from-rose-500/15 dark:via-rose-500/6 dark:to-transparent" />
        </div>
      )}
      {couplesAccent && <CouplesHearts />}
      <div className="relative px-6 pt-4 pb-0">
        {/* Identity row */}
        <div className="flex items-center gap-4 pb-4">
          {initials && (
            <div
              aria-hidden
              className="flex size-14 shrink-0 select-none items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground/60"
            >
              {initials}
            </div>
          )}
          <div className="flex-1">
            <h2 className="type-headline">{title}</h2>
            {subtitle}
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {action}
            {(prevHref || nextHref) && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!prevHref}
                  onClick={() => prevHref && router.push(prevHref)}
                >
                  <IconChevronLeft className="size-4" />
                  <span className="sr-only">Previous</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!nextHref}
                  onClick={() => nextHref && router.push(nextHref)}
                >
                  <IconChevronRight className="size-4" />
                  <span className="sr-only">Next</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Status row */}
        {status && <div className="pb-4">{status}</div>}

        {/* Tabs row */}
        {tabs}
      </div>
    </div>
  )
}
