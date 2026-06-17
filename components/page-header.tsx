"use client"

import * as React from "react"
import Link from "next/link"
import { IconDotsVertical } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="type-headline truncate">{title}</h2>
        {description && (
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export type PageAction = {
  label: string
  icon?: React.ReactNode
  onSelect?: () => void
  href?: string
  newTab?: boolean
  disabled?: boolean
}

/** Renders a single PageAction as an outline button (href-aware). */
function ActionButton({ action }: { action: PageAction }) {
  if (action.href) {
    return (
      <Button variant="outline" disabled={action.disabled} asChild>
        <Link
          href={action.href}
          {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {action.icon}
          {action.label}
        </Link>
      </Button>
    )
  }
  return (
    <Button variant="outline" onClick={action.onSelect} disabled={action.disabled}>
      {action.icon}
      {action.label}
    </Button>
  )
}

/** Renders a single PageAction as a dropdown menu item (href-aware). */
function ActionMenuItem({ action }: { action: PageAction }) {
  if (action.href) {
    return (
      <DropdownMenuItem disabled={action.disabled} asChild>
        <Link
          href={action.href}
          {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {action.icon}
          {action.label}
        </Link>
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuItem disabled={action.disabled} onSelect={action.onSelect}>
      {action.icon}
      {action.label}
    </DropdownMenuItem>
  )
}

/** The "⋮" overflow menu holding a set of actions. */
function OverflowMenu({
  actions,
  className,
}: {
  actions: PageAction[]
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={className}>
          <IconDotsVertical className="size-4" />
          <span className="sr-only">More actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <ActionMenuItem key={action.label} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type PageActionsProps = {
  /**
   * The primary action. Renders as a full-label default button on sm+, and as an
   * icon-only button below sm. Use `children` instead for actions whose trigger is
   * a custom component.
   */
  primary?: PageAction
  /**
   * Secondary actions. On sm+ the first few render inline as outline buttons (the
   * header is capped at 3 visible buttons total) and any extras collapse into a "⋮"
   * overflow menu. Below sm all secondary actions collapse into a single "⋮" menu.
   */
  actions?: PageAction[]
  /** Non-visual siblings (dialogs, import wizards) mounted alongside the buttons. */
  children?: React.ReactNode
}

export function PageActions({ primary, actions = [], children }: PageActionsProps) {
  // Cap the header at 3 visible buttons: 1 primary + up to 2 inline secondary,
  // or 3 inline secondary when there is no primary. Extras overflow to the menu.
  const inlineCap = primary ? 2 : 3
  const inline = actions.slice(0, inlineCap)
  const overflow = actions.slice(inlineCap)

  return (
    <>
      {actions.length > 0 && (
        <>
          {/* Desktop: inline outline buttons + overflow menu for any extras */}
          <div className="hidden items-center gap-2 sm:flex">
            {inline.map((action) => (
              <ActionButton key={action.label} action={action} />
            ))}
            {overflow.length > 0 && <OverflowMenu actions={overflow} />}
          </div>
          {/* Mobile: all secondary actions collapse into one "⋮" menu */}
          <OverflowMenu actions={actions} className="sm:hidden" />
        </>
      )}

      {primary && (
        <>
          {/* Desktop: full-label primary button */}
          <div className="hidden sm:block">
            {primary.href ? (
              <Button disabled={primary.disabled} asChild>
                <Link
                  href={primary.href}
                  {...(primary.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {primary.icon}
                  {primary.label}
                </Link>
              </Button>
            ) : (
              <Button onClick={primary.onSelect} disabled={primary.disabled}>
                {primary.icon}
                {primary.label}
              </Button>
            )}
          </div>
          {/* Mobile: icon-only primary button */}
          {primary.href ? (
            <Button size="icon" className="sm:hidden" disabled={primary.disabled} asChild>
              <Link
                href={primary.href}
                {...(primary.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {primary.icon}
                <span className="sr-only">{primary.label}</span>
              </Link>
            </Button>
          ) : (
            <Button
              size="icon"
              className="sm:hidden"
              onClick={primary.onSelect}
              disabled={primary.disabled}
            >
              {primary.icon}
              <span className="sr-only">{primary.label}</span>
            </Button>
          )}
        </>
      )}

      {children}
    </>
  )
}
