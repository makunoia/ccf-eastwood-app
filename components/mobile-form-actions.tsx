"use client"

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
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 border-t bg-background px-4 py-3 sm:hidden">
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
