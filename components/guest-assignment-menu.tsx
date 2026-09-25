"use client"

import { IconChevronDown } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  onAssignNow: () => void
  onRequestConfirmation: () => void
  canAssignNow: boolean
  canRequestConfirmation: boolean
  disabled?: boolean
  size?: "sm" | "default"
  variant?: "default" | "outline"
}

export function GuestAssignmentMenu({
  onAssignNow,
  onRequestConfirmation,
  canAssignNow,
  canRequestConfirmation,
  disabled = false,
  size = "sm",
  variant = "default",
}: Props) {
  if (!canAssignNow && !canRequestConfirmation) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size={size} variant={variant} disabled={disabled}>
          Assign guest <IconChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {canAssignNow && (
          <DropdownMenuItem onSelect={onAssignNow} className="flex-col items-start gap-0.5">
            <span className="font-medium">Assign now</span>
            <span className="text-xs text-muted-foreground">Promote to member and add to this DGroup.</span>
          </DropdownMenuItem>
        )}
        {canRequestConfirmation && (
          <DropdownMenuItem onSelect={onRequestConfirmation} className="flex-col items-start gap-0.5">
            <span className="font-medium">Request confirmation</span>
            <span className="text-xs text-muted-foreground">Ask the DGroup leader to confirm first.</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
