"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { YearInput } from "@/components/ui/year-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
] as const

type BirthMonthYearInputProps = {
  /** Month as "1".."12", or "" when unset. */
  month: string
  /** Four-digit year, or "" when unset. */
  year: string
  onMonthChange: (value: string) => void
  onYearChange: (value: string) => void
  /** Label text above the row. Pass `null` to render no label. Default "Birth month and year". */
  label?: string | null
  /** Renders a destructive `*` after the label. */
  required?: boolean
  /** Applied to (and used to derive ids for) the field. */
  id?: string
  disabled?: boolean
  /** Wrapper className. */
  className?: string
}

export function BirthMonthYearInput({
  month,
  year,
  onMonthChange,
  onYearChange,
  label = "Birth month and year",
  required = false,
  id,
  disabled,
  className,
}: BirthMonthYearInputProps) {
  const yearId = id ? `${id}-year` : undefined

  return (
    <div className={cn("space-y-2", className)}>
      {label !== null && (
        <Label htmlFor={yearId}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Select
          value={month || "_none"}
          onValueChange={(v) => onMonthChange(v === "_none" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Month</SelectItem>
            {MONTHS.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <YearInput
          id={yearId}
          value={year}
          onChange={onYearChange}
          disabled={disabled}
          className="w-24"
        />
      </div>
    </div>
  )
}
