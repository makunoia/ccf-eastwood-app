"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type PhonePHInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "prefix" | "maxLength"
> & {
  value: string
  onChange: (value: string) => void
  wrapperClassName?: string
}

function extractLocalDigits(input: string): string {
  const digits = input.replace(/\D/g, "")
  // Handle paste of full number: 09XXXXXXXXX or 639XXXXXXXXX
  if (digits.startsWith("63") && digits.length >= 11) return digits.slice(2, 12)
  if (digits.startsWith("0") && digits.length >= 11) return digits.slice(1, 11)
  return digits.slice(0, 10)
}

function formatLocal(local: string): string {
  const a = local.slice(0, 3)
  const b = local.slice(3, 6)
  const c = local.slice(6, 10)
  if (local.length <= 3) return a
  if (local.length <= 6) return `${a} ${b}`
  return `${a} ${b} ${c}`
}

export function toStoredPhonePH(local: string): string {
  return local.length === 0 ? "" : `+63 ${formatLocal(local)}`
}

export function localFromStoredPhonePH(stored: string): string {
  if (!stored) return ""
  // Stored format is "+63 XXX XXX XXXX". Strip the "+63" prefix literally so
  // partial values (e.g. "+63 9") round-trip to "9" instead of being parsed
  // as "639" — otherwise the country-code digits leak into the displayed
  // number as the user types.
  const withoutCountryPrefix = stored.replace(/^\+63\s*/, "")
  return extractLocalDigits(withoutCountryPrefix)
}

function PhonePHInput({
  className,
  wrapperClassName,
  value,
  onChange,
  disabled,
  placeholder = "917 123 4567",
  "aria-invalid": ariaInvalid,
  ...props
}: PhonePHInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const local = localFromStoredPhonePH(value)
  const display = formatLocal(local)

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const input = e.currentTarget
    // Count digits strictly before the caret in the raw input value
    const caretPos = input.selectionStart ?? input.value.length
    const digitsBeforeCaret = input.value.slice(0, caretPos).replace(/\D/g, "").length

    const newLocal = extractLocalDigits(input.value)
    const newDisplay = formatLocal(newLocal)

    // Find caret position in the new formatted string:
    // advance through newDisplay counting digits until we've seen digitsBeforeCaret of them
    let newCaret = 0
    let seen = 0
    for (let i = 0; i < newDisplay.length; i++) {
      if (/\d/.test(newDisplay[i])) seen++
      if (seen === digitsBeforeCaret) {
        newCaret = i + 1
        break
      }
    }
    // If digitsBeforeCaret is 0, caret stays at 0
    if (digitsBeforeCaret === 0) newCaret = 0

    onChange(toStoredPhonePH(newLocal))

    // Restore caret after React re-renders with the new value
    requestAnimationFrame(() => {
      if (inputRef.current === input) {
        input.setSelectionRange(newCaret, newCaret)
      }
    })
  }

  return (
    <div
      data-slot="phone-ph-input"
      aria-invalid={ariaInvalid}
      className={cn(
        "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        disabled && "pointer-events-none opacity-50",
        wrapperClassName,
      )}
    >
      <span className="select-none pl-3 pr-1.5 text-sm leading-none text-muted-foreground">
        +63
      </span>
      <span className="mr-2 h-4 w-px shrink-0 bg-border" />
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        data-slot="input"
        value={display}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={12}
        className={cn(
          "min-w-0 flex-1 bg-transparent pr-3 text-sm leading-none outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    </div>
  )
}

export { PhonePHInput }
