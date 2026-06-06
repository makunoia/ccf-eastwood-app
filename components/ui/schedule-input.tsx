"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TimeInput } from "@/components/ui/time-input"
import { DAYS_OF_WEEK } from "@/lib/constants/group-options"
import { cn } from "@/lib/utils"

const ANY_SENTINEL = "_any"

type ScheduleInputProps = {
  dayOfWeek: string
  timeStart: string
  timeEnd: string
  onDayChange: (v: string) => void
  onTimeStartChange: (v: string) => void
  onTimeEndChange: (v: string) => void
  /**
   * "default" = stacked bordered card (day selector on top, time range below);
   * "inline" = dashed-underline single row (match/profile sections).
   */
  variant?: "default" | "inline"
  /** Show "Any" as the first option — use for optional schedule fields */
  allowAny?: boolean
  disabled?: boolean
  "aria-invalid"?: boolean | "true" | "false"
  className?: string
}

export function ScheduleInput({
  dayOfWeek,
  timeStart,
  timeEnd,
  onDayChange,
  onTimeStartChange,
  onTimeEndChange,
  variant = "default",
  allowAny = false,
  disabled,
  "aria-invalid": ariaInvalid,
  className,
}: ScheduleInputProps) {
  const selectValue = dayOfWeek || (allowAny ? ANY_SENTINEL : undefined)

  function handleDayChange(v: string) {
    onDayChange(v === ANY_SENTINEL ? "" : v)
  }

  // Inline: dashed-underline single row, for match/profile sections.
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-1.5 gap-y-2",
          className,
        )}
      >
        <span className="text-sm text-muted-foreground">On</span>

        <Select value={selectValue} onValueChange={handleDayChange} disabled={disabled}>
          <SelectTrigger className="h-auto w-auto min-w-28 rounded-none border-0 border-b border-dashed border-foreground/40 px-0.5 pb-0.5 text-sm shadow-none focus:ring-0">
            <SelectValue placeholder="day" />
          </SelectTrigger>
          <SelectContent>
            {allowAny && <SelectItem value={ANY_SENTINEL}>Any</SelectItem>}
            {DAYS_OF_WEEK.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">from</span>
        <TimeInput variant="inline" value={timeStart} onChange={onTimeStartChange} disabled={disabled} />
        <span className="text-sm text-muted-foreground">to</span>
        <TimeInput variant="inline" value={timeEnd} onChange={onTimeEndChange} disabled={disabled} />
      </div>
    )
  }

  // Default: stacked bordered card — day selector on top, time range below.
  return (
    <div
      data-slot="schedule-input"
      aria-invalid={ariaInvalid}
      className={cn(
        "w-full overflow-hidden rounded-lg border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {/* Day selector */}
      <Select value={selectValue} onValueChange={handleDayChange} disabled={disabled}>
        <SelectTrigger className="h-11 w-full rounded-none border-0 px-4 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent">
          <SelectValue placeholder="Select a day" />
        </SelectTrigger>
        <SelectContent>
          {allowAny && <SelectItem value={ANY_SENTINEL}>Any</SelectItem>}
          {DAYS_OF_WEEK.map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="border-t border-input" />

      {/* Time range */}
      <div className="flex h-11 items-stretch">
        <div className="flex flex-1 items-center px-4">
          <TimeInput
            variant="bare"
            value={timeStart}
            onChange={onTimeStartChange}
            disabled={disabled}
          />
        </div>

        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-2">
          <div className="w-px flex-1 bg-input" />
          <span className="text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
            To
          </span>
          <div className="w-px flex-1 bg-input" />
        </div>

        <div className="flex flex-1 items-center px-4">
          <TimeInput
            variant="bare"
            value={timeEnd}
            onChange={onTimeEndChange}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
