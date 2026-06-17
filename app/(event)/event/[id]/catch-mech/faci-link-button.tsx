"use client"

import * as React from "react"
import { Copy, Check, ExternalLink } from "lucide-react"
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
      primary={{
        label: "Open",
        icon: <ExternalLink className="size-3.5" />,
        href: url,
        newTab: true,
      }}
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
    />
  )
}
