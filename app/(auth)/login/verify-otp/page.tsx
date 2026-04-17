"use client"

import { useActionState } from "react"
import { verifyOtp } from "./actions"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconBuildingChurch, IconShieldLock } from "@tabler/icons-react"
import Link from "next/link"

export default function VerifyOtpPage() {
  const [state, formAction, isPending] = useActionState(verifyOtp, null)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            {/* ── Left: OTP form ── */}
            <form className="p-8 md:p-10" action={formAction}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center mb-2">
                  <div className="flex items-center justify-center size-12 rounded-xl bg-muted">
                    <IconShieldLock className="size-6 text-muted-foreground" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">Two-factor authentication</h1>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>

                {state?.error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
                    <p className="text-sm text-destructive text-center">{state.error}</p>
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="code">Authentication code</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    placeholder="000 000"
                    autoComplete="one-time-code"
                    autoFocus
                    className="text-center text-lg tracking-widest font-mono"
                    required
                  />
                </Field>

                <Field>
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "Verifying…" : "Verify"}
                  </Button>
                </Field>

                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                    ← Back to sign in
                  </Link>
                </p>
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
    </div>
  )
}
