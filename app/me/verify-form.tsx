"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconArrowRight } from "@tabler/icons-react"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { Button } from "@/components/ui/button"
import { verifyMemberMobile } from "./actions"

export function VerifyForm() {
  const router = useRouter()
  const [mobile, setMobile] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const result = await verifyMemberMobile(mobile)
    if (!result.success) {
      setLoading(false)
      setError(result.error)
      return
    }
    router.push(`/me/${result.data.token}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="mobile" className="text-sm font-medium text-foreground">
          Mobile number
        </label>
        <PhonePHInput
          id="mobile"
          value={mobile}
          onChange={(val) => {
            setMobile(val)
            setError("")
          }}
          autoFocus
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Enter the number connected to your CCF Eastwood member record.
        </p>
        {error && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button
        type="submit"
        disabled={loading || !mobile.trim()}
        className="w-full"
      >
        {loading ? "Verifying..." : "Continue"}
        {!loading && <IconArrowRight className="size-4" />}
      </Button>
    </form>
  )
}
