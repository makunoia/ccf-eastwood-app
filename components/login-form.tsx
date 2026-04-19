"use client"

import { useActionState, useState } from "react"
import { login } from "@/app/(auth)/login/actions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import Image from "next/image"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [state, formAction, isPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className={cn("flex flex-col items-center gap-10", className)} {...props}>
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
        <div className="text-center mb-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account to continue
          </p>
        </div>

        {state?.error && (
          <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-4 py-3">
            <p className="text-sm text-destructive text-center">{state.error}</p>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="email" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Email
          </FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="admin@church.org"
            autoComplete="email"
            required
            className="h-11 bg-background border-border/60 focus-visible:border-[#2AB9D0] focus-visible:ring-[#2AB9D0]/20"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Password
          </FieldLabel>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="h-11 pr-10 bg-background border-border/60 focus-visible:border-[#2AB9D0] focus-visible:ring-[#2AB9D0]/20"
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

        <Button
          type="submit"
          className="w-full h-11 mt-1 bg-[#2AB9D0] hover:bg-[#22a8bc] active:bg-[#1e9aac] text-white font-medium tracking-wide shadow-none border-0 transition-colors"
          disabled={isPending}
        >
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  )
}
