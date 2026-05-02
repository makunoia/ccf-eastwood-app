"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { verifyLeaderMobile } from "./actions"

type GroupResult = {
  token: string
  groupName: string
  pendingCount: number
}

export function VerifyForm() {
  const router = useRouter()
  const [mobile, setMobile] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [groups, setGroups] = React.useState<GroupResult[] | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const result = await verifyLeaderMobile(mobile)
    setLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (result.data.groups.length === 1) {
      router.push(`/small-group-confirmation/${result.data.groups[0].token}`)
      return
    }
    setGroups(result.data.groups)
  }

  if (groups) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          You lead multiple groups. Select one to review:
        </p>
        <div className="space-y-2">
          {groups.map((g) => (
            <a
              key={g.token}
              href={`/small-group-confirmation/${g.token}`}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium text-sm">{g.groupName}</span>
              {g.pendingCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
                  {g.pendingCount} pending
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="mobile" className="text-sm font-medium">
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
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={loading || !mobile.trim()}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? "Verifying…" : "Continue"}
      </button>
    </form>
  )
}
