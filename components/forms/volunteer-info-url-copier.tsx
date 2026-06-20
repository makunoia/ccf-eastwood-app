"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function VolunteerInfoUrlCopier({ eventId }: { eventId: string }) {
  const [copied, setCopied] = React.useState(false)

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${eventId}/volunteer-info`
      : `/events/${eventId}/volunteer-info`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="text-xs text-muted-foreground" />
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  )
}
