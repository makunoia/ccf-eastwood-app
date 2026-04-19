"use client"

import { useActionState } from "react"
import { verifyOtp } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { IconShieldLock } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

export default function VerifyOtpPage() {
  const [state, formAction, isPending] = useActionState(verifyOtp, null)

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10 bg-[#f6fefe]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 10% 0%, #2AB9D012 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 90% 100%, #2AB9D00d 0%, transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm flex flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/ccf-logo.png"
            alt="CCF Eastwood"
            width={72}
            height={72}
            priority
            className="drop-shadow-sm"
          />
          <div className="text-center space-y-0.5">
            <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#2AB9D0]">
              CCF Eastwood
            </p>
            <p className="text-[11px] tracking-widest text-muted-foreground/70 uppercase">
              Admin App
            </p>
          </div>
        </div>

        <form action={formAction} className="w-full flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 text-center mb-1">
            <div className="flex items-center justify-center size-11 rounded-xl bg-[#2AB9D0]/10 border border-[#2AB9D0]/20">
              <IconShieldLock className="size-5 text-[#2AB9D0]" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                Two-factor auth
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          </div>

          {state?.error && (
            <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-4 py-3">
              <p className="text-sm text-destructive text-center">{state.error}</p>
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="code" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Authentication code
            </FieldLabel>
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
              className="h-11 text-center text-xl tracking-[0.3em] font-mono bg-background border-border/60 focus-visible:border-[#2AB9D0] focus-visible:ring-[#2AB9D0]/20"
              required
            />
          </Field>

          <Button
            type="submit"
            className="w-full h-11 mt-1 bg-[#2AB9D0] hover:bg-[#22a8bc] active:bg-[#1e9aac] text-white font-medium tracking-wide shadow-none border-0 transition-colors"
            disabled={isPending}
          >
            {isPending ? "Verifying…" : "Verify"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-[#2AB9D0] transition-colors underline-offset-4 hover:underline">
              ← Back to sign in
            </Link>
          </p>
        </form>
      </div>

      <p className="relative mt-12 text-[11px] tracking-widest text-muted-foreground/40 uppercase">
        Members · Events · Small Groups · Ministries
      </p>
    </div>
  )
}
