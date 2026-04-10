"use client"

import { useActionState, useState } from "react"
import { changePassword } from "./actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconKey, IconEye, IconEyeOff } from "@tabler/icons-react"

export default function ChangePasswordPage() {
  const [state, formAction, isPending] = useActionState(changePassword, null)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="w-full max-w-md">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center size-6 rounded-full bg-muted-foreground/20 text-muted-foreground text-xs font-bold">1</span>
          <span className="text-sm text-muted-foreground">Set up 2FA</span>
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
          <span className="text-sm font-medium">Set password</span>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10">
              <IconKey className="size-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Set your password</CardTitle>
          <CardDescription>
            Your administrator generated a temporary password. Please set a new one before continuing.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={formAction}>
            <FieldGroup>
              {state?.error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
                  <p className="text-sm text-destructive text-center">{state.error}</p>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <div className="relative">
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    className="pr-10"
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </button>
                </div>
                {state?.fieldErrors?.newPassword && (
                  <p className="text-xs text-destructive mt-1">{state.fieldErrors.newPassword}</p>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </button>
                </div>
                {state?.fieldErrors?.confirmPassword && (
                  <p className="text-xs text-destructive mt-1">{state.fieldErrors.confirmPassword}</p>
                )}
              </Field>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving…" : "Save password & continue"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
