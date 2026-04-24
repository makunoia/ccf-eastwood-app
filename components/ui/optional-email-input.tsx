"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ComponentProps } from "react"

type InputProps = ComponentProps<typeof Input>

type OptionalEmailInputProps = Omit<InputProps, "type" | "disabled"> & {
  disabled?: boolean
  noEmail: boolean
  onNoEmailChange: (noEmail: boolean) => void
  checkboxLabel?: string
}

export function OptionalEmailInput({
  value,
  onChange,
  noEmail,
  onNoEmailChange,
  disabled,
  checkboxLabel = "I don't have an email address",
  id,
  ...props
}: OptionalEmailInputProps) {
  const checkboxId = `${id ?? "email"}-no-email`

  function handleNoEmailChange(checked: boolean | "indeterminate") {
    const isChecked = checked === true
    if (isChecked && onChange) {
      onChange({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>)
    }
    onNoEmailChange(isChecked)
  }

  return (
    <div className="rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      <Input
        id={id}
        type="email"
        value={value}
        onChange={onChange}
        disabled={disabled || noEmail}
        className="rounded-none border-0 shadow-none focus-visible:ring-0"
        {...props}
      />
      <div className="flex items-center gap-2 border-t border-input bg-muted/40 px-3 py-2">
        <Checkbox
          id={checkboxId}
          checked={noEmail}
          onCheckedChange={handleNoEmailChange}
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
