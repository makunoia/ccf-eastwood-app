import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Compact card for a single labeled setting: an icon, a title and description,
 * an optional right-aligned control (Switch, Badge, Button), and optional
 * expandable content below the header.
 *
 * Exists because the shadcn `Card` primitive bakes in `py-6` + `gap-6`, which
 * doubles up against the per-card padding overrides these setting rows need.
 * Use this instead of hand-rolling `<Card className="py-4"><CardHeader className="px-4">…`.
 */
export function SettingCard({
  icon: Icon,
  title,
  description,
  control,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  /** Expandable content rendered below the header. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              {description && (
                <CardDescription className="mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
          {control && <div className="shrink-0">{control}</div>}
        </div>
      </CardHeader>
      {children && <CardContent className="px-4">{children}</CardContent>}
    </Card>
  )
}
