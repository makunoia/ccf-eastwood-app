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

type PageActionsProps = {
  /**
   * Secondary actions: inline outline buttons on sm+, collapsed into an
   * overflow menu below sm so the header always stays on one row.
   */
  actions?: PageAction[]
  /** Primary action button(s) — always visible. Dialogs can be included here too. */
  children?: React.ReactNode
}

export function PageActions({ actions = [], children }: PageActionsProps) {
  return (
    <>
      {actions.length > 0 && (
        <>
          <div className="hidden items-center gap-2 sm:flex">
            {actions.map((action) =>
              action.href ? (
                <Button key={action.label} variant="outline" disabled={action.disabled} asChild>
                  <Link
                    href={action.href}
                    {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {action.icon}
                    {action.label}
                  </Link>
                </Button>
              ) : (
                <Button
                  key={action.label}
                  variant="outline"
                  onClick={action.onSelect}
                  disabled={action.disabled}
                >
                  {action.icon}
                  {action.label}
                </Button>
              )
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="sm:hidden">
                <IconDotsVertical className="size-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) =>
                action.href ? (
                  <DropdownMenuItem key={action.label} disabled={action.disabled} asChild>
                    <Link
                      href={action.href}
                      {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {action.icon}
                      {action.label}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={action.label}
                    disabled={action.disabled}
                    onSelect={action.onSelect}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      {children}
    </>
  )
}
