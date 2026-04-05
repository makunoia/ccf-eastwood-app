"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createEventCommittee,
  createRole,
  deleteCommittee,
  deleteRole,
} from "../../ministries/committee-actions"

type Role = { id: string; name: string }
type Committee = { id: string; name: string; roles: Role[] }

type Props = {
  eventId: string
  committees: Committee[]
}

export function CommitteeManager({ eventId, committees }: Props) {
  const router = useRouter()

  // ── Add committee dialog ──────────────────────────────────────────────────
  const [addCommitteeOpen, setAddCommitteeOpen] = React.useState(false)
  const [committeeName, setCommitteeName] = React.useState("")
  const [savingCommittee, setSavingCommittee] = React.useState(false)

  async function handleAddCommittee() {
    setSavingCommittee(true)
    const result = await createEventCommittee(eventId, { name: committeeName })
    setSavingCommittee(false)
    if (result.success) {
      toast.success("Committee added")
      setAddCommitteeOpen(false)
      setCommitteeName("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  // ── Delete committee dialog ───────────────────────────────────────────────
  const [deleteCommitteeId, setDeleteCommitteeId] = React.useState<string | null>(null)
  const [deletingCommittee, setDeletingCommittee] = React.useState(false)
  const committeeToDelete = committees.find((c) => c.id === deleteCommitteeId)

  async function handleDeleteCommittee() {
    if (!deleteCommitteeId) return
    setDeletingCommittee(true)
    const result = await deleteCommittee(deleteCommitteeId, { eventId })
    setDeletingCommittee(false)
    if (result.success) {
      toast.success("Committee deleted")
      setDeleteCommitteeId(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  // ── Add role dialog ───────────────────────────────────────────────────────
  const [addRoleCommitteeId, setAddRoleCommitteeId] = React.useState<string | null>(null)
  const [roleName, setRoleName] = React.useState("")
  const [savingRole, setSavingRole] = React.useState(false)

  async function handleAddRole() {
    if (!addRoleCommitteeId) return
    setSavingRole(true)
    const result = await createRole(addRoleCommitteeId, { name: roleName }, { eventId })
    setSavingRole(false)
    if (result.success) {
      toast.success("Role added")
      setAddRoleCommitteeId(null)
      setRoleName("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  // ── Delete role dialog ────────────────────────────────────────────────────
  const [deleteRoleId, setDeleteRoleId] = React.useState<string | null>(null)
  const [deletingRole, setDeletingRole] = React.useState(false)
  const roleToDelete = committees
    .flatMap((c) => c.roles)
    .find((r) => r.id === deleteRoleId)

  async function handleDeleteRole() {
    if (!deleteRoleId) return
    setDeletingRole(true)
    const result = await deleteRole(deleteRoleId, { eventId })
    setDeletingRole(false)
    if (result.success) {
      toast.success("Role deleted")
      setDeleteRoleId(null)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Committees and roles for volunteer registration at this event.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setAddCommitteeOpen(true)}
        >
          <IconPlus className="size-4" />
          Add committee
        </Button>
      </div>

      {committees.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No committees yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {committees.map((committee) => (
            <div key={committee.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="font-medium">{committee.name}</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddRoleCommitteeId(committee.id)}
                  >
                    <IconPlus className="size-4" />
                    Add role
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteCommitteeId(committee.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>

              {committee.roles.length > 0 && (
                <div className="border-t px-4 py-2">
                  <div className="space-y-1">
                    {committee.roles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center justify-between rounded px-2 py-1 text-sm"
                      >
                        <span>{role.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteRoleId(role.id)}
                        >
                          <IconTrash className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {committee.roles.length === 0 && (
                <div className="border-t px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    No roles yet — add one above.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add committee dialog */}
      <Dialog open={addCommitteeOpen} onOpenChange={setAddCommitteeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add committee</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="committee-name">Name</Label>
            <Input
              id="committee-name"
              value={committeeName}
              onChange={(e) => setCommitteeName(e.target.value)}
              placeholder="e.g. Worship, Logistics"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddCommittee() }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddCommitteeOpen(false); setCommitteeName("") }}
              disabled={savingCommittee}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCommittee} disabled={savingCommittee || !committeeName.trim()}>
              {savingCommittee ? "Adding…" : "Add committee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add role dialog */}
      <Dialog
        open={!!addRoleCommitteeId}
        onOpenChange={(open) => { if (!open) { setAddRoleCommitteeId(null); setRoleName("") } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add role</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Vocalist, Sound Technician"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddRole() }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddRoleCommitteeId(null); setRoleName("") }}
              disabled={savingRole}
            >
              Cancel
            </Button>
            <Button onClick={handleAddRole} disabled={savingRole || !roleName.trim()}>
              {savingRole ? "Adding…" : "Add role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete committee dialog */}
      <Dialog
        open={!!deleteCommitteeId}
        onOpenChange={(open) => { if (!open) setDeleteCommitteeId(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete committee</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{committeeToDelete?.name}</span>?
            All roles in this committee will also be deleted. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCommitteeId(null)} disabled={deletingCommittee}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCommittee} disabled={deletingCommittee}>
              {deletingCommittee ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete role dialog */}
      <Dialog
        open={!!deleteRoleId}
        onOpenChange={(open) => { if (!open) setDeleteRoleId(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{roleToDelete?.name}</span>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoleId(null)} disabled={deletingRole}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole} disabled={deletingRole}>
              {deletingRole ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
