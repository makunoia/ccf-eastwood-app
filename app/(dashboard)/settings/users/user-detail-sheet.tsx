"use client"

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  IconCopy,
  IconCheck,
  IconShieldCheck,
  IconShield,
  IconAlertTriangle,
} from "@tabler/icons-react"
import type { FeatureArea, PermissionAction } from "@/app/generated/prisma/client"
import type { UserRow, EventOption } from "./columns"

const FEATURE_LABELS: Record<FeatureArea, string> = {
  Members: "Members",
  Guests: "Guests",
  SmallGroups: "Small Groups",
  Ministries: "Ministries",
  Events: "Events",
  Volunteers: "Volunteers",
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  Read: "Read",
  Write: "Write",
  Import: "Import",
  Export: "Export",
}

type Props = {
  user: UserRow | null
  events: EventOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserDetailSheet({ user, events, open, onOpenChange }: Props) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    if (!user?.tempPassword) return
    await navigator.clipboard.writeText(user.tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!user) return null

  const isSuperAdmin = user.role === "SuperAdmin"

  function statusLabel() {
    if (user!.requiresTotpSetup) return "Pending setup"
    if (user!.mustChangePassword) return "Password reset required"
    return "Active"
  }

  function statusVariant(): "default" | "secondary" {
    if (user!.requiresTotpSetup || user!.mustChangePassword) return "secondary"
    return "default"
  }

  const eventAccessLabels =
    user.eventAccess.length === 0
      ? "All events"
      : user.eventAccess
          .map((id) => events.find((e) => e.id === id)?.name ?? id)
          .join(", ")

  const hasEventsPermission = user.permissions.some((p) => p.feature === "Events")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{user.name ?? user.username}</SheetTitle>
          <SheetDescription>
            @{user.username}
            {user.email ? ` · ${user.email}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 px-4 pb-6">
          {/* Role & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Role
              </p>
              {isSuperAdmin ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <IconShieldCheck className="size-4 text-primary" />
                  Super Admin
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <IconShield className="size-4" />
                  Staff
                </div>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Status
              </p>
              <Badge variant={statusVariant()}>{statusLabel()}</Badge>
            </div>
          </div>

          {/* TOTP & Created */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                2FA
              </p>
              <p className="text-sm">{user.totpEnabled ? "Enabled" : "Not set up"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Created
              </p>
              <p className="text-sm">
                {user.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <Separator />

          {/* Feature access */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Feature access
            </p>
            {isSuperAdmin ? (
              <p className="text-sm text-muted-foreground">All features — full access</p>
            ) : user.permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No access</p>
            ) : (
              <div className="space-y-1.5">
                {user.permissions.map(({ feature, actions }) => (
                  <div key={feature} className="flex items-center justify-between">
                    <span className="text-sm">{FEATURE_LABELS[feature as FeatureArea]}</span>
                    <div className="flex gap-1">
                      {(["Read", "Write", "Import", "Export"] as PermissionAction[]).map((a) => (
                        <Badge
                          key={a}
                          variant={actions.includes(a) ? "outline" : "secondary"}
                          className={`text-xs px-1.5 ${!actions.includes(a) ? "opacity-30" : ""}`}
                        >
                          {ACTION_LABELS[a]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event access — only for Staff with Events permission */}
          {!isSuperAdmin && hasEventsPermission && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Event access
              </p>
              <p className="text-sm">{eventAccessLabels}</p>
            </div>
          )}

          <Separator />

          {/* Temporary password */}
          {user.tempPassword && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Temporary password
              </p>
              <div className="rounded-lg bg-muted border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono tracking-wider select-all break-all">
                    {user.tempPassword}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <IconCheck className="size-4 text-green-600" />
                    ) : (
                      <IconCopy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                <IconAlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>
                  This password is cleared once the user completes their account setup.
                </span>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
