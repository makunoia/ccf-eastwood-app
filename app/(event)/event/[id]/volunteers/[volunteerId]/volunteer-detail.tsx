"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconCircleCheckFilled, IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { DetailPageHeader } from "@/components/detail-page-header"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { updateEventVolunteer, deleteEventVolunteerById } from "./actions"

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

type VolunteerData = {
  id: string
  memberId: string
  eventId: string
  memberName: string
  memberId_link: string
  committeeId: string
  preferredRoleId: string
  assignedRoleId: string | null
  status: "Pending" | "Confirmed" | "Rejected"
  notes: string | null
  leaderApprovalToken: string | null
  leaderNotes: string | null
  committees: Committee[]
}

const STATUS_VARIANT = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
} as const

type FormState = {
  committeeId: string
  preferredRoleId: string
  assignedRoleId: string
  status: "Pending" | "Confirmed" | "Rejected"
  notes: string
}

export function EventVolunteerDetail({
  volunteer,
  canViewMember,
}: {
  volunteer: VolunteerData
  canViewMember: boolean
}) {
  const router = useRouter()
  const { prev, next } = useListNavigation(volunteer.id, "volunteerListIds")
  const [form, setForm] = React.useState<FormState>({
    committeeId: volunteer.committeeId,
    preferredRoleId: volunteer.preferredRoleId,
    assignedRoleId: volunteer.assignedRoleId ?? "",
    status: volunteer.status,
    notes: volunteer.notes ?? "",
  })
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm({
      committeeId: volunteer.committeeId,
      preferredRoleId: volunteer.preferredRoleId,
      assignedRoleId: volunteer.assignedRoleId ?? "",
      status: volunteer.status,
      notes: volunteer.notes ?? "",
    })
  }

  const selectedCommittee = volunteer.committees.find((c) => c.id === form.committeeId)
  const committeeRoles = selectedCommittee?.roles ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await updateEventVolunteer(volunteer.id, volunteer.eventId, {
      memberId: volunteer.memberId,
      eventId: volunteer.eventId,
      committeeId: form.committeeId,
      preferredRoleId: form.preferredRoleId,
      assignedRoleId: form.assignedRoleId,
      status: form.status,
      notes: form.notes,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Volunteer updated")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEventVolunteerById(volunteer.id, volunteer.eventId)
    setDeleting(false)
    if (result.success) {
      toast.success("Volunteer removed")
      setDeleteOpen(false)
      router.push(`/event/${volunteer.eventId}/volunteers`)
    } else {
      toast.error(result.error)
    }
  }

  const approvalUrl =
    volunteer.leaderApprovalToken
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/volunteer-approval/${volunteer.leaderApprovalToken}`
      : null

  async function copyApprovalLink() {
    if (!approvalUrl) return
    await navigator.clipboard.writeText(approvalUrl)
    toast.success("Approval link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-0">
      <BreadcrumbOverride
        href={`/event/${volunteer.eventId}/volunteers/${volunteer.id}`}
        label={volunteer.memberName}
      />

      <DetailPageHeader
        title={volunteer.memberName}
        subtitle={<Badge variant={STATUS_VARIANT[volunteer.status]}>{volunteer.status}</Badge>}
        action={
          <Button type="submit" form="event-volunteer-form" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
        prevHref={prev ? `/event/${volunteer.eventId}/volunteers/${prev}` : null}
        nextHref={next ? `/event/${volunteer.eventId}/volunteers/${next}` : null}
      />

      <div className="p-6 pb-24 sm:pb-6">
        <form id="event-volunteer-form" onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {/* Committee */}
          <div className="space-y-2">
            <Label htmlFor="committee">
              Committee <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.committeeId}
              onValueChange={(v) => {
                set("committeeId", v)
                set("preferredRoleId", "")
                set("assignedRoleId", "")
              }}
            >
              <SelectTrigger id="committee">
                <SelectValue placeholder="Select committee" />
              </SelectTrigger>
              <SelectContent>
                {volunteer.committees.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No committees — add them in event settings
                  </SelectItem>
                ) : (
                  volunteer.committees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Preferred role */}
          {form.committeeId && (
            <div className="space-y-2">
              <Label htmlFor="preferredRole">
                Preferred Role <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.preferredRoleId}
                onValueChange={(v) => set("preferredRoleId", v)}
              >
                <SelectTrigger id="preferredRole">
                  <SelectValue placeholder="Select preferred role" />
                </SelectTrigger>
                <SelectContent>
                  {committeeRoles.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No roles — add them in event settings
                    </SelectItem>
                  ) : (
                    committeeRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assigned role */}
          {form.committeeId && (
            <div className="space-y-2">
              <Label htmlFor="assignedRole">Assigned Role</Label>
              <Select
                value={form.assignedRoleId || "none"}
                onValueChange={(v) => set("assignedRoleId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="assignedRole">
                  <SelectValue placeholder="Not yet assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not yet assigned</SelectItem>
                  {committeeRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as "Pending" | "Confirmed" | "Rejected")}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Confirmed">Confirmed</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
            />
          </div>
        </form>

        {/* Member link */}
        {canViewMember && (
          <div className="max-w-2xl mt-6">
            <Button variant="outline" asChild>
              <Link href={`/members/${volunteer.memberId_link}`}>View Member Profile</Link>
            </Button>
          </div>
        )}

        {/* Leader approval */}
        <div className="max-w-2xl mt-6 rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Leader Approval</p>
              {volunteer.status !== "Confirmed" && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Share this link with the volunteer&apos;s DGroup leader to request approval.
                </p>
              )}
            </div>
            <Badge variant={STATUS_VARIANT[volunteer.status]}>{volunteer.status}</Badge>
          </div>

          {volunteer.status === "Confirmed" ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <IconCircleCheckFilled className="size-4 shrink-0" />
              <span>This volunteer has been confirmed by the leader.</span>
            </div>
          ) : (
            approvalUrl && (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                  {approvalUrl}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyApprovalLink}>
                  <IconCopy className="size-4" />
                  Copy link
                </Button>
              </div>
            )
          )}

          {volunteer.leaderNotes && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Leader&apos;s notes</p>
              <p className="text-sm">{volunteer.leaderNotes}</p>
            </div>
          )}
        </div>
      </div>

      <MobileFormActions
        formId="event-volunteer-form"
        isEdit
        saving={saving}
        saveLabel="Save changes"
        onRevert={handleRevert}
        onDelete={() => setDeleteOpen(true)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{volunteer.memberName}</span> as a volunteer? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
