"use client"

import { useActionState, useState } from "react"
import { login } from "@/app/(auth)/login/actions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { IconEye, IconEyeOff, IconBuildingChurch } from "@tabler/icons-react"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [state, formAction, isPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* ── Left: form ── */}
          <form className="p-8 md:p-10" action={formAction}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center mb-2">
                <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                <p className="text-sm text-muted-foreground">
                  Sign in to your CCF Eastwood Admin App account
                </p>
              </div>

              {state?.error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
                  <p className="text-sm text-destructive text-center">{state.error}</p>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@church.org"
                  autoComplete="email"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <IconEyeOff className="size-4" />
                    ) : (
                      <IconEye className="size-4" />
                    )}
                  </button>
                </div>
              </Field>

              <Field>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Signing in…" : "Sign in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>

          {/* ── Right: brand panel ── */}
          <div className="relative hidden md:flex flex-col items-center justify-center gap-6 bg-primary px-10 py-12 text-primary-foreground rounded-r-xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center justify-center size-16 rounded-2xl bg-primary-foreground/10 border border-primary-foreground/20">
                <IconBuildingChurch className="size-8 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">CCF Eastwood Admin App</h2>
                <p className="mt-1 text-sm text-primary-foreground/70 leading-relaxed max-w-[18ch]">
                  Church management for administrators
                </p>
              </div>
            </div>
            <div className="absolute bottom-6 text-xs text-primary-foreground/40">
              Members · Events · Small Groups · Ministries
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
