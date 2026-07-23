import type { Metadata } from "next"
import { IconLock, IconUserCircle } from "@tabler/icons-react"
import { VerifyForm } from "./verify-form"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig } from "@/lib/forms/config"

export const metadata: Metadata = {
  title: { absolute: "Member Portal" },
}

export default async function MePage() {
  const formConfig = await getFormConfig("MemberSelfService")
  if (!formConfig.isOpen) return <FormClosed />

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-72 bg-primary/[0.07]"
      />
      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
          <div className="mb-8 space-y-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <IconUserCircle className="size-6" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                CCF Eastwood
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Your small groups
              </h1>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Use your mobile number to see your group and manage the groups you lead.
              </p>
            </div>
          </div>
          <VerifyForm />
          <div className="mt-6 flex items-center gap-2 border-t pt-5 text-xs leading-5 text-muted-foreground">
            <IconLock className="size-3.5 shrink-0" />
            Your information is only used to find your member record.
          </div>
        </div>
      </div>
    </main>
  )
}
