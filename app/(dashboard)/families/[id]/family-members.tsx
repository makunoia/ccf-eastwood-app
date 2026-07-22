"use client"

import * as React from "react"
import Link from "next/link"
import { IconPlus, IconTrash, IconUserScan } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FAMILY_ROLES,
  FAMILY_ROLE_LABELS,
  type FamilyRoleValue,
} from "@/lib/validations/family"
import {
  addFamilyMember,
  removeFamilyMember,
  searchPeopleForFamily,
  updateFamilyMemberRole,
  type FamilyPersonSearchResult,
} from "../actions"

export type FamilyMemberEntry = {
  id: string
  role: FamilyRoleValue
  personName: string
  memberId: string | null
  guestId: string | null
}

const nameLinkClass =
  "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

function AddPersonDialog({
  familyId,
  open,
  onOpenChange,
}: {
  familyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<FamilyPersonSearchResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [selected, setSelected] = React.useState<FamilyPersonSearchResult | null>(null)
  const [role, setRole] = React.useState<FamilyRoleValue | "">("")
  const [saving, setSaving] = React.useState(false)
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the picker on each open (render-phase reset, not an effect)
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery("")
      setResults([])
      setSelected(null)
      setRole("")
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const result = await searchPeopleForFamily(q, familyId)
      setSearching(false)
      if (result.success) setResults(result.data)
    }, 300)
  }

  async function handleAdd() {
    if (!selected || !role) return
    setSaving(true)
    const result = await addFamilyMember(familyId, {
      memberId: selected.type === "member" ? selected.id : null,
      guestId: selected.type === "guest" ? selected.id : null,
      role,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Added to family")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to family</DialogTitle>
          <DialogDescription>
            Search members and guests by name, phone, or email.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {selected.firstName} {selected.lastName}
              </span>
              {selected.type === "guest" && <Badge variant="secondary">Guest</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Search people..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              autoFocus
            />
            {query.trim().length >= 2 && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {searching ? (
                  <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No matches found</p>
                ) : (
                  results.map((p) => (
                    <button
                      key={`${p.type}-${p.id}`}
                      type="button"
                      onClick={() => setSelected(p)}
                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                    >
                      <span>
                        <span className="font-medium">
                          {p.firstName} {p.lastName}
                        </span>
                        {(p.phone || p.email) && (
                          <span className="ml-2 text-muted-foreground">
                            {p.phone ?? p.email}
                          </span>
                        )}
                      </span>
                      {p.type === "guest" && <Badge variant="secondary">Guest</Badge>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Role in family</Label>
          <Select value={role} onValueChange={(v) => setRole(v as FamilyRoleValue)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {FAMILY_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {FAMILY_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={saving || !selected || !role}>
            {saving ? "Adding…" : "Add to family"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MemberRow({
  entry,
  canWrite,
}: {
  entry: FamilyMemberEntry
  canWrite: boolean
}) {
  const [removeOpen, setRemoveOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [updatingRole, setUpdatingRole] = React.useState(false)

  async function handleRoleChange(role: FamilyRoleValue) {
    setUpdatingRole(true)
    const result = await updateFamilyMemberRole(entry.id, role)
    setUpdatingRole(false)
    if (result.success) {
      toast.success("Role updated")
    } else {
      toast.error(result.error)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    const result = await removeFamilyMember(entry.id)
    setRemoving(false)
    if (result.success) {
      toast.success("Removed from family")
      setRemoveOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  const href = entry.memberId
    ? `/members/${entry.memberId}`
    : entry.guestId
      ? `/guests/${entry.guestId}`
      : null

  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {href ? (
          <Link href={href} className={nameLinkClass}>
            {entry.personName}
          </Link>
        ) : (
          <span className="font-medium">{entry.personName}</span>
        )}
        {entry.guestId && (
          <Badge variant="secondary" className="gap-1">
            <IconUserScan className="size-3" />
            Guest
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canWrite ? (
          <Select
            value={entry.role}
            onValueChange={(v) => handleRoleChange(v as FamilyRoleValue)}
            disabled={updatingRole}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FAMILY_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {FAMILY_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">{FAMILY_ROLE_LABELS[entry.role]}</Badge>
        )}

        {canWrite && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
            >
              <IconTrash className="size-4" />
              <span className="sr-only">Remove from family</span>
            </Button>

            <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove from family</DialogTitle>
                  <DialogDescription>
                    Remove <span className="font-medium">{entry.personName}</span>{" "}
                    from this family? Their member/guest record is kept.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setRemoveOpen(false)}
                    disabled={removing}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  )
}

const ROLE_ORDER: Record<FamilyRoleValue, number> = {
  FatherHusband: 0,
  MotherWife: 1,
  Guardian: 2,
  Child: 3,
  Other: 4,
}

export function FamilyMembers({
  familyId,
  entries,
  canWrite,
}: {
  familyId: string
  entries: FamilyMemberEntry[]
  canWrite: boolean
}) {
  const [addOpen, setAddOpen] = React.useState(false)
  const sorted = [...entries].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.personName.localeCompare(b.personName)
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Family members</CardTitle>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="size-4" />
            Add person
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No one in this family yet. Add parents and children to get started.
          </p>
        ) : (
          sorted.map((entry) => (
            <MemberRow key={entry.id} entry={entry} canWrite={canWrite} />
          ))
        )}
      </CardContent>

      {canWrite && (
        <AddPersonDialog familyId={familyId} open={addOpen} onOpenChange={setAddOpen} />
      )}
    </Card>
  )
}
