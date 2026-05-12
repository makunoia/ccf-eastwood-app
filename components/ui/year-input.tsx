"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type YearInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode" | "maxLength" | "min" | "max"
> & {
  value: string
  onChange?: (value: string) => void
}

export function YearInput({
  value,
  onChange,
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  ...props
}: YearInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const digits = (value ?? "").replace(/\D/g, "").slice(0, 4)
  const displayValue = digits + "_".repeat(4 - digits.length)

  function moveCursorToEnd() {
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = inputRef.current.value.replace(/_+$/, "").length
        inputRef.current.setSelectionRange(pos, pos)
      }
    })
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDigits = e.target.value.replace(/\D/g, "").slice(0, 4)
    onChange?.(newDigits)
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newDigits.length, newDigits.length)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const passthrough = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"]
    if (passthrough.includes(e.key) || e.metaKey || e.ctrlKey) return
    if (!/^\d$/.test(e.key)) {
      e.preventDefault()
      return
    }
    if (digits.length >= 4) e.preventDefault()
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
    onChange?.(pasted)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      data-slot="input"
      inputMode="numeric"
      autoComplete="off"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={moveCursorToEnd}
      onFocus={moveCursorToEnd}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "font-mono tracking-widest",
        className,
      )}
      {...props}
    />
  )
}
