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
  IconCircleMinus,
  IconDotsVertical,
  IconLink,
  IconPlayerSkipForward,
  IconRotateClockwise,
  IconSparkles,
} from "@tabler/icons-react"

import {
  dismissEventSetup,
  setEventSetupStepSkipped,
} from "@/app/(dashboard)/events/actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TimelineEntry } from "@/components/ui/timeline-entry"
import { cn } from "@/lib/utils"
import type { EventSetupChecklist as ChecklistData, SetupStep } from "@/lib/events/setup-checklist"

type Props = {
  eventId: string
  checklist: ChecklistData
}

export function EventSetupChecklist({ eventId, checklist }: Props) {
  const { steps, completedCount, skippedCount, totalCount, allComplete } = checklist

  // An event that arrives already finished opens as the summary line alone; the
  // list is still one click away, which is the only route back to a skipped step.
  const [collapsed, setCollapsed] = useState(allComplete)
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

  // The first step still genuinely outstanding — what the timeline marks "up next".
  const nextIndex = steps.findIndex((s) => !s.done && !s.skipped)

  return (
    <Card className={cn(allComplete && "border-primary/30 bg-primary/5")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {allComplete && (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <IconSparkles className="size-6" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold leading-none">
                {allComplete
                  ? skippedCount > 0
                    ? "Nothing left on your checklist"
                    : "Your event is all set up! 🎉"
                  : "Set up your event"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {completedCount} of {totalCount} steps done
                {skippedCount > 0 && ` · ${skippedCount} skipped`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {allComplete && (
              <Button onClick={handleDismiss} disabled={dismissing} size="sm">
                {dismissing ? "Dismissing…" : "Dismiss"}
              </Button>
            )}
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
        </div>

        {/* Segmented progress bar — one segment per step. */}
        <div className="mt-3 flex items-center gap-1">
          {steps.map((s) => (
            <div
              key={s.key}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                s.done
                  ? "bg-primary"
                  : s.skipped
                    ? "bg-muted-foreground/30"
                    : "bg-muted"
              )}
            />
          ))}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent>
          <div>
            {steps.map((step, i) => (
              <StepRow
                key={step.key}
                eventId={eventId}
                step={step}
                isLast={i === steps.length - 1}
                isNext={i === nextIndex}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function StepRow({
  eventId,
  step,
  isLast,
  isNext,
}: {
  eventId: string
  step: SetupStep
  isLast: boolean
  isNext: boolean
}) {
  const [pending, startTransition] = useTransition()

  function setSkipped(skipped: boolean) {
    startTransition(async () => {
      const result = await setEventSetupStepSkipped(eventId, step.key, skipped)
      if (!result.success) toast.error(result.error)
      else toast.success(skipped ? "Step skipped" : "Step restored")
    })
  }

  // Done wins over skipped in the display: if the work happened anyway, saying so
  // is more useful than remembering that it was once waved off.
  const state = step.done ? "done" : step.skipped ? "skipped" : "pending"

  return (
    <TimelineEntry
      isLast={isLast}
      icon={
        state === "done" ? (
          <IconCircleCheckFilled className="size-5 text-primary" />
        ) : state === "skipped" ? (
          <IconCircleMinus className="size-5 text-muted-foreground/50" />
        ) : isNext ? (
          <IconCircleDashed className="size-5 text-foreground/70" />
        ) : (
          <IconCircle className="size-5 text-muted-foreground/50" />
        )
      }
    >
      <div className={cn("flex items-start justify-between gap-3", pending && "opacity-60")}>
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              state === "done" && "text-muted-foreground line-through",
              state === "skipped" && "text-muted-foreground"
            )}
          >
            {step.label}
            {state === "skipped" && (
              <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-foreground/70">
                Skipped
              </span>
            )}
          </p>
          {state === "pending" && (
            <p className="text-sm text-muted-foreground">{step.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {state === "pending" && <StepCta eventId={eventId} step={step} />}
          {state !== "done" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={pending}
                  aria-label={`More options for “${step.label}”`}
                >
                  <IconDotsVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {state === "skipped" ? (
                  <DropdownMenuItem onSelect={() => setSkipped(false)}>
                    <IconRotateClockwise className="size-4" />
                    Restore step
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setSkipped(true)}>
                    <IconPlayerSkipForward className="size-4" />
                    Skip this step
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </TimelineEntry>
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
