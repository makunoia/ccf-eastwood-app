"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function CopyCatchMechLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
      toast.success("Catch Mech link copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Could not copy link")
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleCopy}>
      {copied ? (
        <Check className="mr-1.5 size-3.5 text-green-600" />
      ) : (
        <Copy className="mr-1.5 size-3.5" />
      )}
      Copy link
    </Button>
  )
}
