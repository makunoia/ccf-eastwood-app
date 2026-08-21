"use client"

import * as React from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard"
import { cn } from "@/lib/utils"

/**
 * A table cell value you can click to copy — used for every email and mobile
 * number the admin app shows.
 *
 * These are the two things staff retype most often (into a chat, a call, a
 * mail-merge), and retyping a mobile number by eye is exactly how a duplicate
 * record gets created, since lookup is an exact match on the canonical
 * `"+63 XXX XXX XXXX"` string.
 *
 * The whole value is the target, so there is nothing small to aim at. The icon
 * is revealed on row hover rather than shown always: two permanently-visible
 * icons per row across a hundred rows is a lot of furniture for an affordance
 * most rows never need. Keyboard users get it on focus, and the button carries
 * its own label, so the hover reveal is decoration rather than the only cue.
 *
 * `title` holds the untruncated value, and the copy always sends the full
 * string — what lands on the clipboard is never what the column had room for.
 */
export function CopyableText({
  value,
  label,
  className,
  empty = "—",
}: {
  value: string | null | undefined
  /** What was copied, for the toast and the accessible name: "Email", "Mobile". */
  label: string
  className?: string
  empty?: React.ReactNode
}) {
  const { copied, copy } = useCopyToClipboard()

  if (!value) {
    return <span className="text-muted-foreground">{empty}</span>
  }

  async function handleCopy() {
    const ok = await copy(value as string)
    if (ok) toast.success(`${label} copied`)
    else toast.error(`Could not copy ${label.toLowerCase()}`)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      aria-label={`Copy ${label.toLowerCase()}: ${value}`}
      className={cn(
        "group/copy flex w-full min-w-0 items-center gap-1.5 rounded-sm text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
    >
      {/* `block` + `min-w-0` are load-bearing: `truncate` sets overflow, which
          does nothing to a flex child that is still free to grow. */}
      <span className="block min-w-0 flex-1 truncate">{value}</span>
      {copied ? (
        <IconCheck className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <IconCopy
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-opacity",
            "opacity-0 group-hover/row:opacity-60 group-hover/copy:opacity-100",
            "group-focus-visible/copy:opacity-100",
          )}
        />
      )}
    </button>
  )
}
