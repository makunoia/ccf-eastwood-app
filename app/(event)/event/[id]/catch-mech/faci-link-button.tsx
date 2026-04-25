"use client"

import * as React from "react"
import { Copy, Check, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FaciLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="size-3.5 text-green-600" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? "Copied!" : "Copy Faci Link"}
      </Button>
      <Button variant="default" size="sm" className="gap-2" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" />
          Open
        </a>
      </Button>
    </div>
  )
}
