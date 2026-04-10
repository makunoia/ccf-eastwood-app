"use client"

import { useActionState, useEffect, useState } from "react"
import { enableTotp, initTotpSetup } from "./actions"
import { buildTotpUri } from "@/lib/totp"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconShieldLock, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import QRCode from "react-qr-code"

export default function Setup2faPage() {
  const [state, formAction, isPending] = useActionState(enableTotp, null)
  const [secret, setSecret] = useState<string | null>(null)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const [showManualKey, setShowManualKey] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    initTotpSetup().then((result) => {
      if ("error" in result && result.error) {
        setInitError(result.error)
      } else if ("secret" in result && result.secret) {
        setSecret(result.secret)
        setQrUri(buildTotpUri(result.secret, result.email))
      }
    })
  }, [])

  return (
    <div className="w-full max-w-md">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
          <span className="text-sm font-medium">Set up 2FA</span>
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center size-6 rounded-full bg-muted-foreground/20 text-muted-foreground text-xs font-bold">2</span>
          <span className="text-sm text-muted-foreground">Set password</span>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10">
              <IconShieldLock className="size-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Set up two-factor authentication</CardTitle>
          <CardDescription>
            Scan the QR code below with Google Authenticator, Authy, or any TOTP app.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {initError ? (
            <p className="text-sm text-destructive text-center">{initError}</p>
          ) : !qrUri ? (
            <div className="flex justify-center py-8">
              <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : (
            <form action={formAction}>
              <FieldGroup>
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="rounded-xl border bg-white p-4">
                    <QRCode value={qrUri} size={180} />
                  </div>
                </div>

                {/* Manual key toggle */}
                <button
                  type="button"
                  onClick={() => setShowManualKey((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  {showManualKey ? (
                    <IconChevronUp className="size-3" />
                  ) : (
                    <IconChevronDown className="size-3" />
                  )}
                  Can&apos;t scan? Enter key manually
                </button>

                {showManualKey && (
                  <div className="rounded-md bg-muted px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Manual entry key</p>
                    <p className="font-mono text-sm tracking-widest break-all select-all">
                      {secret}
                    </p>
                  </div>
                )}

                {state?.error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
                    <p className="text-sm text-destructive text-center">{state.error}</p>
                  </div>
                )}

                {/* OTP input */}
                <Field>
                  <FieldLabel htmlFor="code">Enter the 6-digit code to confirm</FieldLabel>
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    placeholder="000 000"
                    autoComplete="one-time-code"
                    className="text-center text-lg tracking-widest font-mono"
                    required
                  />
                </Field>

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Activating…" : "Activate two-factor authentication"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
