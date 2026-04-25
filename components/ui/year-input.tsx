"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import type { ComponentProps } from "react"

type YearInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode" | "maxLength"
> & {
  value: string
  onChange?: (value: string) => void
}

export function YearInput({
  value,
  onChange,
  placeholder = "YYYY",
  ...props
}: YearInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 4)
    onChange?.(val)
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      maxLength={4}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      {...props}
    />
  )
}
