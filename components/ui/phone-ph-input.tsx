"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type PhonePHInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "prefix"
> & {
  value: string
  onChange: (value: string) => void
  wrapperClassName?: string
}

function extractLocalDigits(input: string): string {
  const digits = input.replace(/\D/g, "")
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
  return extractLocalDigits(stored ?? "")
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
  const local = localFromStoredPhonePH(value)
  const display = formatLocal(local)

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const newLocal = extractLocalDigits(e.target.value)
    onChange(toStoredPhonePH(newLocal))
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
      <span className="select-none pl-3 pr-2 text-base text-muted-foreground md:text-sm">
        +63
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        data-slot="input"
        value={display}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent py-1 pr-3 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm",
          className,
        )}
        {...props}
      />
    </div>
  )
}

export { PhonePHInput }
