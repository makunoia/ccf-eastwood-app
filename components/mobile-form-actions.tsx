"use client"

import * as React from "react"
import { IconTrash, IconArrowBackUp } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

type Props = {
  formId: string
  isEdit: boolean
  saving: boolean
  saveLabel: string
  onRevert: () => void
  onDelete?: () => void
}

export function MobileFormActions({
  formId,
  isEdit,
  saving,
  saveLabel,
  onRevert,
  onDelete,
}: Props) {
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    function update() {
      if (!barRef.current) return
      // Distance from the bottom of the layout viewport to the bottom of the
      // visual viewport — this equals the keyboard height when it is open.
      const keyboardHeight =
        window.innerHeight - viewport!.offsetTop - viewport!.height
      barRef.current.style.bottom = `${Math.max(0, keyboardHeight)}px`
    }

    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])

  return (
    <div
      ref={barRef}
      style={{ transition: "bottom 0.1s ease-out" }}
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 border-t bg-background px-4 py-3 sm:hidden"
    >
      <div className="flex items-center gap-1">
        {isEdit && onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            disabled={saving}
          >
            <IconTrash className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRevert}
          disabled={saving}
        >
          <IconArrowBackUp className="size-4" />
        </Button>
      </div>
      <Button type="submit" form={formId} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </Button>
    </div>
  )
}
