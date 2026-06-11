"use client"

import * as React from "react"
import { Copy, Check, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageActions } from "@/components/page-header"

export function FaciLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(`${window.location.origin}${url}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageActions
      actions={[
        {
          label: copied ? "Copied!" : "Copy Faci Link",
          icon: copied ? (
            <Check className="size-3.5 text-green-600" />
          ) : (
            <Copy className="size-3.5" />
          ),
          onSelect: handleCopy,
        },
      ]}
    >
      <Button asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" />
          Open
        </a>
      </Button>
    </PageActions>
  )
}
