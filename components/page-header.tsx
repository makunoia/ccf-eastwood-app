"use client"

import * as React from "react"
import Link from "next/link"
import { IconDots } from "@tabler/icons-react"
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
  /**
   * Always render this action inside the "⋯" overflow menu, never inline — even
   * when there is room. Use for utility actions like Import/Export.
   */
  overflow?: boolean
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

/** The "⋯" overflow menu holding a set of actions. */
function OverflowMenu({ actions }: { actions: PageAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <IconDots className="size-4" />
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

/** The primary action button — full label on sm+, icon-only when `iconOnly`. */
function PrimaryButton({ primary, iconOnly }: { primary: PageAction; iconOnly?: boolean }) {
  const content = (
    <>
      {primary.icon}
      {iconOnly ? <span className="sr-only">{primary.label}</span> : primary.label}
    </>
  )
  if (primary.href) {
    return (
      <Button size={iconOnly ? "icon" : undefined} disabled={primary.disabled} asChild>
        <Link
          href={primary.href}
          {...(primary.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {content}
        </Link>
      </Button>
    )
  }
  return (
    <Button
      size={iconOnly ? "icon" : undefined}
      onClick={primary.onSelect}
      disabled={primary.disabled}
    >
      {content}
    </Button>
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
   * Secondary actions. On sm+ inline-eligible actions render as outline buttons
   * (the header is capped at 3 visible buttons total) before the primary, and any
   * extras — plus anything flagged `overflow` (e.g. Import/Export) — collapse into
   * a "⋯" menu pinned to the far right. Below sm all secondary actions collapse
   * into that single "⋯" menu.
   */
  actions?: PageAction[]
  /** Non-visual siblings (dialogs, import wizards) mounted alongside the buttons. */
  children?: React.ReactNode
}

export function PageActions({ primary, actions = [], children }: PageActionsProps) {
  // Cap the header at 3 visible buttons: 1 primary + up to 2 inline secondary, or 3
  // inline secondary when there is no primary. Actions flagged `overflow` never go
  // inline; remaining extras overflow too. Order is preserved in the menu.
  const inlineCap = primary ? 2 : 3
  const inline = actions.filter((a) => !a.overflow).slice(0, inlineCap)
  const inlineSet = new Set(inline)
  const overflow = actions.filter((a) => !inlineSet.has(a))

  if (!primary && actions.length === 0) return <>{children}</>

  return (
    <>
      {/* Desktop: inline secondary → primary → overflow menu (far right) */}
      <div className="hidden items-center gap-2 sm:flex">
        {inline.map((action) => (
          <ActionButton key={action.label} action={action} />
        ))}
        {primary && <PrimaryButton primary={primary} />}
        {overflow.length > 0 && <OverflowMenu actions={overflow} />}
      </div>

      {/* Mobile: icon-only primary → overflow menu (far right) */}
      <div className="flex items-center gap-2 sm:hidden">
        {primary && <PrimaryButton primary={primary} iconOnly />}
        {actions.length > 0 && <OverflowMenu actions={actions} />}
      </div>

      {children}
    </>
  )
}
