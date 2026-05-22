"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { changeAccountPassword } from "./actions"

type FieldErrors = Record<string, string>

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [fields, setFields] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })

  function set(key: keyof typeof fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }))
  }

  function toggle(key: keyof typeof show) {
    return () => setShow((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    startTransition(async () => {
      const result = await changeAccountPassword(
        fields.currentPassword,
        fields.newPassword,
        fields.confirmPassword
      )
      if (!result.success) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        else toast.error(result.error)
        return
      }
      setFields({ currentPassword: "", newPassword: "", confirmPassword: "" })
      toast.success("Password updated")
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <PasswordInput
            id="currentPassword"
            value={fields.currentPassword}
            onChange={set("currentPassword")}
            show={show.current}
            onToggle={toggle("current")}
            autoComplete="current-password"
            error={fieldErrors.currentPassword}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <PasswordInput
            id="newPassword"
            value={fields.newPassword}
            onChange={set("newPassword")}
            show={show.new}
            onToggle={toggle("new")}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={fieldErrors.newPassword}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            value={fields.confirmPassword}
            onChange={set("confirmPassword")}
            show={show.confirm}
            onToggle={toggle("confirm")}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

type PasswordInputProps = {
  id: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  show: boolean
  onToggle: () => void
  autoComplete?: string
  placeholder?: string
  error?: string
}

function PasswordInput({ id, value, onChange, show, onToggle, autoComplete, placeholder, error }: PasswordInputProps) {
  return (
    <>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pr-10"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </>
  )
}
