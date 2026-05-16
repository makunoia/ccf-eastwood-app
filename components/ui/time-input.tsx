"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type TimeInputProps = {
  value: string
  onChange?: (value: string) => void
  variant?: "default" | "inline"
  className?: string
  disabled?: boolean
  "aria-invalid"?: boolean | "true" | "false"
}

// Parse 24-hour "HH:MM" into 12-hour digits string + period
export function parse24(value: string): { digits: string; period: "am" | "pm" } {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return { digits: "", period: "am" }
  const hrs24 = parseInt(match[1])
  const mins = parseInt(match[2])
  const period: "am" | "pm" = hrs24 < 12 ? "am" : "pm"
  const hrs12 = hrs24 % 12 || 12
  return {
    digits: `${hrs12.toString().padStart(2, "0")}${mins.toString().padStart(2, "0")}`,
    period,
  }
}

// Convert 12-hour digits + period back to 24-hour "HH:MM", or "" if incomplete/invalid
export function to24(digits: string, period: "am" | "pm"): string {
  if (digits.length < 4) return ""
  const hrs12 = parseInt(digits.slice(0, 2))
  const mins = parseInt(digits.slice(2, 4))
  if (!Number.isFinite(hrs12) || !Number.isFinite(mins)) return ""
  if (hrs12 < 1 || hrs12 > 12 || mins < 0 || mins > 59) return ""
  let hrs24 = hrs12
  if (period === "am" && hrs12 === 12) hrs24 = 0
  else if (period === "pm" && hrs12 !== 12) hrs24 = hrs12 + 12
  return `${hrs24.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

// Format up to 4 digits as "HH:MM" with "_" fill for untyped positions
export function formatDisplay(digits: string): string {
  const d = digits.padEnd(4, "_")
  return `${d[0]}${d[1]}:${d[2]}${d[3]}`
}

// Cursor position after the last typed digit (accounting for the ":" separator)
function getCursorPos(rawLength: number): number {
  return rawLength + (rawLength >= 2 ? 1 : 0)
}

export function TimeInput({
  value,
  onChange,
  variant = "default",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: TimeInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [rawDigits, setRawDigits] = React.useState(() => parse24(value).digits)
  const [period, setPeriod] = React.useState<"am" | "pm">(() => parse24(value).period)

  // Sync internal state when the value prop changes from outside
  const internalValue = to24(rawDigits, period)
  React.useEffect(() => {
    if (value !== internalValue) {
      const parsed = parse24(value)
      setRawDigits(parsed.digits)
      setPeriod(parsed.period)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function moveCursorToEnd() {
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = getCursorPos(rawDigits.length)
        inputRef.current.setSelectionRange(pos, pos)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault()
      const next = rawDigits.slice(0, -1)
      setRawDigits(next)
      onChange?.(to24(next, period))
      return
    }
    const passthrough = ["Tab", "ArrowLeft", "ArrowRight", "Home", "End"]
    if (passthrough.includes(e.key) || e.metaKey || e.ctrlKey) return
    if (!/^\d$/.test(e.key)) {
      e.preventDefault()
      return
    }
    if (rawDigits.length >= 4) {
      e.preventDefault()
      return
    }
    e.preventDefault()

    let next = rawDigits + e.key

    // Hour validation (12-hour format: 01–12)
    if (rawDigits.length === 0) {
      // First hour digit 2–9 → auto-pad to "0X" (13–19 are impossible in 12hr)
      if (parseInt(e.key) >= 2) next = "0" + e.key
    } else if (rawDigits.length === 1) {
      // Second hour digit: reject if hours would be 00 or > 12
      const hrs = parseInt(rawDigits[0] + e.key)
      if (hrs === 0 || hrs > 12) return
    }

    setRawDigits(next)
    onChange?.(to24(next, period))
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
    if (digits.length >= 2) {
      const hrs = parseInt(digits.slice(0, 2))
      if (hrs === 0 || hrs > 12) return
    }
    setRawDigits(digits)
    onChange?.(to24(digits, period))
  }

  function togglePeriod() {
    const next = period === "am" ? "pm" : "am"
    setPeriod(next)
    onChange?.(to24(rawDigits, next))
  }

  const displayValue = rawDigits.length > 0 ? formatDisplay(rawDigits) : ""

  const inputEl = (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      readOnly
      value={displayValue}
      placeholder="00:00"
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={moveCursorToEnd}
      onFocus={moveCursorToEnd}
      disabled={disabled}
      className={cn(
        "min-w-0 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed font-mono",
        variant === "default"
          ? "flex-1 pl-3 text-sm leading-none tracking-widest"
          : "w-[4.5ch] text-sm tracking-wider",
      )}
    />
  )

  const periodButton = (
    <button
      type="button"
      onClick={togglePeriod}
      disabled={disabled}
      tabIndex={-1}
      className={cn(
        "select-none transition-colors text-muted-foreground hover:text-foreground text-sm",
        variant === "default" ? "pr-3 pl-1.5 leading-none shrink-0" : "leading-none",
      )}
    >
      {period}
    </button>
  )

  if (variant === "inline") {
    return (
      <div
        data-slot="time-input"
        aria-invalid={ariaInvalid}
        className={cn(
          "inline-flex items-center gap-0.5",
          "border-b border-dashed border-foreground/40",
          "focus-within:border-foreground/60",
          "pb-0.5",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        {inputEl}
        {periodButton}
      </div>
    )
  }

  return (
    <div
      data-slot="time-input"
      aria-invalid={ariaInvalid}
      className={cn(
        "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {inputEl}
      {periodButton}
    </div>
  )
}
