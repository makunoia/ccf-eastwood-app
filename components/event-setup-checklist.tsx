"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  IconArrowRight,
  IconChevronDown,
  IconCircle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconLink,
  IconSparkles,
} from "@tabler/icons-react"

import { dismissEventSetup } from "@/app/(dashboard)/events/actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TimelineEntry } from "@/components/ui/timeline-entry"
import { cn } from "@/lib/utils"
import type { EventSetupChecklist as ChecklistData, SetupStep } from "@/lib/events/setup-checklist"

type Props = {
  eventId: string
  checklist: ChecklistData
}

export function EventSetupChecklist({ eventId, checklist }: Props) {
  const { steps, completedCount, totalCount, allComplete } = checklist

  const [collapsed, setCollapsed] = useState(false)
  const [dismissing, startDismiss] = useTransition()

  function toggleCollapsed() {
    setCollapsed((prev) => !prev)
  }

  function handleDismiss() {
    startDismiss(async () => {
      const result = await dismissEventSetup(eventId)
      if (!result.success) toast.error(result.error)
    })
  }

  if (allComplete) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <IconSparkles className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Your event is all set up! 🎉</p>
            <p className="text-sm text-muted-foreground">
              Every recommended step is done. You can dismiss this checklist.
            </p>
          </div>
          <Button onClick={handleDismiss} disabled={dismissing} className="shrink-0">
            {dismissing ? "Dismissing…" : "Dismiss"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold leading-none">Set up your event</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {completedCount} of {totalCount} steps done
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand setup checklist" : "Collapse setup checklist"}
            aria-expanded={!collapsed}
          >
            <IconChevronDown
              className={cn("size-4 transition-transform", !collapsed && "rotate-180")}
            />
          </Button>
        </div>

        {/* Segmented progress bar — one segment per step. */}
        <div className="mt-3 flex items-center gap-1">
          {steps.map((s) => (
            <div
              key={s.key}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                s.done ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent>
          <div>
            {steps.map((step, i) => (
              <TimelineEntry
                key={step.key}
                isLast={i === steps.length - 1}
                icon={
                  step.done ? (
                    <IconCircleCheckFilled className="size-5 text-primary" />
                  ) : i === completedCount ? (
                    <IconCircleDashed className="size-5 text-foreground/70" />
                  ) : (
                    <IconCircle className="size-5 text-muted-foreground/50" />
                  )
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium leading-snug",
                        step.done && "text-muted-foreground line-through"
                      )}
                    >
                      {step.label}
                    </p>
                    {!step.done && (
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    )}
                  </div>
                  {!step.done && <StepCta eventId={eventId} step={step} />}
                </div>
              </TimelineEntry>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function StepCta({ eventId, step }: { eventId: string; step: SetupStep }) {
  if (step.action === "copyRegisterLink") {
    function copy() {
      const url = `${window.location.origin}/events/${eventId}/register`
      navigator.clipboard.writeText(url).then(
        () => toast.success("Registration link copied"),
        () => toast.error("Could not copy link")
      )
    }
    return (
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
        <IconLink className="size-3.5" />
        Copy link
      </Button>
    )
  }

  return (
    <Button asChild variant="outline" size="sm" className="shrink-0">
      <Link href={step.href}>
        Go
        <IconArrowRight className="size-3.5" />
      </Link>
    </Button>
  )
}
