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
  /** "default" = bordered inputs (forms); "inline" = dashed-underline style (match sections) */
  variant?: "default" | "inline"
  /** Show "Any" as the first option — use for optional schedule fields */
  allowAny?: boolean
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
  className,
}: ScheduleInputProps) {
  const isInline = variant === "inline"
  const selectValue = dayOfWeek || (allowAny ? ANY_SENTINEL : undefined)

  function handleDayChange(v: string) {
    onDayChange(v === ANY_SENTINEL ? "" : v)
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2",
        isInline ? "items-baseline gap-x-1.5 gap-y-2" : "items-center",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">On</span>

      <Select value={selectValue} onValueChange={handleDayChange}>
        {isInline ? (
          <SelectTrigger className="h-auto w-auto min-w-28 border-0 border-b border-dashed border-foreground/40 rounded-none px-0.5 pb-0.5 shadow-none focus:ring-0 text-sm">
            <SelectValue placeholder="day" />
          </SelectTrigger>
        ) : (
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
        )}
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

      <TimeInput
        variant={isInline ? "inline" : "default"}
        value={timeStart}
        onChange={onTimeStartChange}
        className={isInline ? undefined : "w-32"}
      />

      <span className="text-sm text-muted-foreground">to</span>

      <TimeInput
        variant={isInline ? "inline" : "default"}
        value={timeEnd}
        onChange={onTimeEndChange}
        className={isInline ? undefined : "w-32"}
      />
    </div>
  )
}
