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
}: DetailPageHeaderProps) {
  const router = useRouter()

  return (
    <div className="border-b">
      <div className="px-6 pt-4 pb-0">
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
