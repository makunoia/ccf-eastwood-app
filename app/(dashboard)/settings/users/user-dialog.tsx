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
import {
  FEATURE_AREAS,
  PERMISSION_ACTIONS,
  type FeatureAreaValue,
  type PermissionActionValue,
  type PermissionEntryInput,
} from "@/lib/validations/user-management"
import { createUser, updateUserPermissions } from "./actions"
import type { UserRow, EventOption } from "./columns"

const FEATURE_LABELS: Record<FeatureAreaValue, string> = {
  Members: "Members",
  Guests: "Guests",
  SmallGroups: "DGroups",
  Ministries: "Ministries",
  Events: "Events",
  Volunteers: "Volunteers",
  Forms: "Forms",
}

const ACTION_LABELS: Record<PermissionActionValue, string> = {
  Read: "Read",
  Write: "Write",
  Import: "Import",
  Export: "Export",
}

/** Actions that imply Read (must be removed if Read is unchecked). */
const READ_DEPENDENTS: PermissionActionValue[] = ["Write", "Import", "Export"]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserRow
  events: EventOption[]
}

type CreatedState = { generatedPassword: string }

function emptyPermissions(): Record<FeatureAreaValue, PermissionActionValue[]> {
  return Object.fromEntries(FEATURE_AREAS.map((f) => [f, []])) as unknown as Record<
    FeatureAreaValue,
    PermissionActionValue[]
  >
}

export function UserDialog({ open, onOpenChange, user, events }: Props) {
  const isEdit = !!user

  const [username, setUsername] = React.useState("")
  const [name, setName] = React.useState("")
  // Map of feature → selected actions
  const [permMap, setPermMap] = React.useState<Record<FeatureAreaValue, PermissionActionValue[]>>(emptyPermissions)
  const [eventScope, setEventScope] = React.useState<"all" | "specific">("all")
  const [eventIds, setEventIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [created, setCreated] = React.useState<CreatedState | null>(null)
  const [copied, setCopied] = React.useState(false)

  // Populate form when editing
  React.useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(user.name ?? "")
      const map = emptyPermissions()
      for (const { feature, actions } of user.permissions) {
        map[feature as FeatureAreaValue] = actions as PermissionActionValue[]
      }
      setPermMap(map)
      const hasSpecific = user.eventAccess.length > 0
      setEventScope(hasSpecific ? "specific" : "all")
      setEventIds(user.eventAccess)
    } else {
      setUsername("")
      setName("")
      setPermMap(emptyPermissions())
      setEventScope("all")
      setEventIds([])
    }
    setCreated(null)
  }, [user, open])

  function toggleAction(feature: FeatureAreaValue, action: PermissionActionValue) {
    setPermMap((prev) => {
      const current = prev[feature]
      let next: PermissionActionValue[]

      if (current.includes(action)) {
        // Unchecking Read → also remove all dependents
        if (action === "Read") {
          next = current.filter((a) => a !== "Read" && !READ_DEPENDENTS.includes(a))
        } else {
          next = current.filter((a) => a !== action)
        }
      } else {
        // Checking Write/Import/Export → auto-add Read
        if (READ_DEPENDENTS.includes(action) && !current.includes("Read")) {
          next = [...current, "Read", action]
        } else {
          next = [...current, action]
        }
      }

      // If all actions removed for Events, reset event scope
      if (feature === "Events" && next.length === 0) {
        setEventScope("all")
        setEventIds([])
      }

      return { ...prev, [feature]: next }
    })
  }

  function toggleEvent(id: string) {
    setEventIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  // Convert permMap to the array format expected by the action
  function buildPermissions(): PermissionEntryInput[] {
    return FEATURE_AREAS.filter((f) => permMap[f].length > 0).map((feature) => ({
      feature,
      actions: permMap[feature],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const permissions = buildPermissions()
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
      const result = await createUser({ username, name, permissions, eventIds: resolvedEventIds })
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
              <span className="font-medium">@{username}</span>. They will be prompted to set
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
  const hasEventsPermission = permMap["Events"].length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit permissions" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the feature access for ${user?.name ?? user?.username}.`
              : "Create a new account. A temporary password will be generated."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            {/* Name & username — create only */}
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
                  <Label htmlFor="username">
                    Username <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="jdoe"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    pattern="[a-z0-9._\-]+"
                    minLength={3}
                    maxLength={32}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    3–32 chars. Lowercase letters, numbers, dots, dashes, or underscores.
                  </p>
                </div>
              </>
            )}

            {/* Feature access with per-feature action checkboxes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Feature access</Label>
                {/* Action legend */}
                <div className="flex items-center">
                  {PERMISSION_ACTIONS.map((a) => (
                    <span key={a} className="w-16 text-center text-xs text-muted-foreground">{ACTION_LABELS[a]}</span>
                  ))}
                </div>
              </div>

              <div className="rounded-md border divide-y">
                {FEATURE_AREAS.map((feature) => {
                  const actions = permMap[feature]
                  return (
                    <div key={feature} className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-medium">{FEATURE_LABELS[feature]}</span>
                      <div className="flex items-center">
                        {PERMISSION_ACTIONS.map((action) => {
                          const isChecked = actions.includes(action)
                          // Read cannot be unchecked if a dependent action is active
                          const isReadLocked =
                            action === "Read" &&
                            READ_DEPENDENTS.some((dep) => actions.includes(dep))
                          return (
                            <div key={action} className="w-16 flex justify-center">
                              <Checkbox
                                checked={isChecked}
                                disabled={isReadLocked}
                                onCheckedChange={() => toggleAction(feature, action)}
                                aria-label={`${FEATURE_LABELS[feature]} — ${ACTION_LABELS[action]}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Event access — only shown when Events has any actions */}
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
