"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { IconCopy, IconCheck, IconAlertTriangle } from "@tabler/icons-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FEATURE_AREAS, type FeatureAreaValue } from "@/lib/validations/user-management"
import { createUser, updateUserPermissions } from "./actions"
import type { UserRow, EventOption } from "./columns"

const FEATURE_LABELS: Record<FeatureAreaValue, string> = {
  Members: "Members",
  Guests: "Guests",
  SmallGroups: "Small Groups",
  Ministries: "Ministries",
  Events: "Events",
  Volunteers: "Volunteers",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserRow
  events: EventOption[]
}

type CreatedState = { generatedPassword: string }

export function UserDialog({ open, onOpenChange, user, events }: Props) {
  const isEdit = !!user

  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [permissions, setPermissions] = React.useState<FeatureAreaValue[]>([])
  const [eventScope, setEventScope] = React.useState<"all" | "specific">("all")
  const [eventIds, setEventIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [created, setCreated] = React.useState<CreatedState | null>(null)
  const [copied, setCopied] = React.useState(false)

  // Populate form when editing
  React.useEffect(() => {
    if (user) {
      setName(user.name ?? "")
      setPermissions(user.permissions as FeatureAreaValue[])
      const hasSpecific = user.eventAccess.length > 0
      setEventScope(hasSpecific ? "specific" : "all")
      setEventIds(user.eventAccess)
    } else {
      setEmail("")
      setName("")
      setPermissions([])
      setEventScope("all")
      setEventIds([])
    }
    setCreated(null)
  }, [user, open])

  function togglePermission(feature: FeatureAreaValue) {
    const next = permissions.includes(feature)
      ? permissions.filter((p) => p !== feature)
      : [...permissions, feature]
    setPermissions(next)
    if (feature === "Events" && !next.includes("Events")) {
      setEventScope("all")
      setEventIds([])
    }
  }

  function toggleEvent(id: string) {
    setEventIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const resolvedEventIds = eventScope === "all" ? [] : eventIds

    if (isEdit) {
      const result = await updateUserPermissions(user!.id, { permissions, eventIds: resolvedEventIds })
      setSaving(false)
      if (result.success) {
        toast.success("Permissions updated")
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createUser({ email, name, permissions, eventIds: resolvedEventIds })
      setSaving(false)
      if (result.success) {
        setCreated({ generatedPassword: result.data.generatedPassword })
      } else {
        toast.error(result.error)
      }
    }
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.generatedPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── "Account Created" state ─────────────────────────────────────────────────
  if (created) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account created</DialogTitle>
            <DialogDescription>
              Share this temporary password with{" "}
              <span className="font-medium">{email}</span>. They will be prompted to set
              up two-factor authentication and change their password on first login.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-muted border px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-mono tracking-wider select-all break-all">
                {created.generatedPassword}
              </code>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCopy}>
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
            <span>Save this password now — it won&apos;t be shown again.</span>
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Create / Edit form ──────────────────────────────────────────────────────
  const hasEventsPermission = permissions.includes("Events")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit permissions" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the feature access for ${user?.name ?? user?.email}.`
              : "Create a new account. A temporary password will be generated."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            {/* Name & email — create only */}
            {!isEdit && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@church.org"
                    required
                  />
                </div>
              </>
            )}

            {/* Feature access */}
            <div className="space-y-3">
              <Label>Feature access</Label>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_AREAS.map((feature) => (
                  <label
                    key={feature}
                    className="flex items-center gap-2 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={permissions.includes(feature)}
                      onCheckedChange={() => togglePermission(feature)}
                    />
                    <span className="text-sm">{FEATURE_LABELS[feature]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Event access — only shown when Events is selected */}
            {hasEventsPermission && (
              <div className="space-y-3">
                <Label>Event access</Label>
                <RadioGroup
                  value={eventScope}
                  onValueChange={(v) => {
                    setEventScope(v as "all" | "specific")
                    if (v === "all") setEventIds([])
                  }}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors has-data-[state=checked]:border-primary">
                    <RadioGroupItem value="all" />
                    <span className="text-sm">All events</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors has-data-[state=checked]:border-primary">
                    <RadioGroupItem value="specific" />
                    <span className="text-sm">Specific events</span>
                  </label>
                </RadioGroup>

                {eventScope === "specific" && events.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border p-2">
                    {events.map((event) => (
                      <label
                        key={event.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={eventIds.includes(event.id)}
                          onCheckedChange={() => toggleEvent(event.id)}
                        />
                        <span className="text-sm">{event.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
