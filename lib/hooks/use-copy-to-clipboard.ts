"use client"

import * as React from "react"

/**
 * Copy a string, and remember for a moment that you did.
 *
 * The app had eleven hand-rolled versions of this before, split between two
 * feedback styles (a label that flips to "Copied!" and a toast), a couple of
 * which dropped the promise on the floor so a denied clipboard permission
 * looked like a successful copy. One implementation, one behaviour.
 *
 * The caller supplies the notification: a link copier wants a toast naming the
 * link, a table cell wants a quieter one naming the field.
 */
export function useCopyToClipboard({ resetAfterMs = 1500 } = {}): {
  copied: boolean
  copy: (value: string) => Promise<boolean>
} {
  const [copied, setCopied] = React.useState(false)
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const copy = React.useCallback(
    async (value: string) => {
      try {
        // Absent over plain HTTP and in some embedded webviews — worth checking
        // rather than throwing a TypeError at whoever clicked.
        if (!navigator?.clipboard?.writeText) return false
        await navigator.clipboard.writeText(value)
        setCopied(true)
        if (timeout.current) clearTimeout(timeout.current)
        timeout.current = setTimeout(() => setCopied(false), resetAfterMs)
        return true
      } catch {
        return false
      }
    },
    [resetAfterMs],
  )

  return { copied, copy }
}
