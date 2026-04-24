"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import type { ComponentProps } from "react"

type PhonePHInputProps = ComponentProps<typeof PhonePHInput>

type OptionalPhonePHInputProps = Omit<PhonePHInputProps, "disabled"> & {
  disabled?: boolean
  noNumber: boolean
  onNoNumberChange: (noNumber: boolean) => void
  checkboxLabel?: string
}

export function OptionalPhonePHInput({
  value,
  onChange,
  noNumber,
  onNoNumberChange,
  disabled,
  checkboxLabel = "I don't have a mobile number",
  id,
  ...props
}: OptionalPhonePHInputProps) {
  const checkboxId = `${id ?? "phone"}-no-number`

  function handleNoNumberChange(checked: boolean | "indeterminate") {
    const isChecked = checked === true
    if (isChecked) {
      onChange("")
    }
    onNoNumberChange(isChecked)
  }

  return (
    <div className="rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      <PhonePHInput
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled || noNumber}
        wrapperClassName="border-0 rounded-none shadow-none focus-within:ring-0"
        {...props}
      />
      <div className="flex items-center gap-2 border-t border-input bg-muted/40 px-3 py-2">
        <Checkbox
          id={checkboxId}
          checked={noNumber}
          onCheckedChange={handleNoNumberChange}
          disabled={disabled}
        />
        <Label
          htmlFor={checkboxId}
          className="text-xs font-normal text-muted-foreground cursor-pointer leading-none"
        >
          {checkboxLabel}
        </Label>
      </div>
    </div>
  )
}
