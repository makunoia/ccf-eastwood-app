"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  defaultVolunteerForm,
  type VolunteerFormValues,
} from "@/lib/validations/volunteer"
import { createVolunteer, updateVolunteer, deleteVolunteer } from "./actions"
import { MobileFormActions } from "@/components/mobile-form-actions"

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }
type Event = { id: string; name: string; committees: Committee[] }

type VolunteerDetail = {
  id: string
  memberName: string
  eventName: string
  committee: string
  preferredRole: string
  assignedRole: string | null
  status: "Pending" | "Confirmed" | "Rejected"
  memberId: string
  eventId: string
  committeeId: string
  preferredRoleId: string
  assignedRoleId: string | null
  notes: string | null
  leaderApprovalToken: string | null
  leaderNotes: string | null
}

type Props = {
  members: { id: string; firstName: string; lastName: string }[]
  events: Event[]
  volunteer?: VolunteerDetail
}

const STATUS_VARIANT = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
} as const

function toFormValues(v: VolunteerDetail): VolunteerFormValues {
  return {
    memberId: v.memberId,
    eventId: v.eventId,
    committeeId: v.committeeId,
    preferredRoleId: v.preferredRoleId,
    assignedRoleId: v.assignedRoleId ?? "",
    status: v.status,
    notes: v.notes ?? "",
  }
}

export function VolunteerForm({ members, events, volunteer }: Props) {
  const router = useRouter()
  const isEdit = !!volunteer
  const [form, setForm] = React.useState<VolunteerFormValues>(
    () => (volunteer ? toFormValues(volunteer) : defaultVolunteerForm)
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set<K extends keyof VolunteerFormValues>(field: K, value: VolunteerFormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(volunteer ? toFormValues(volunteer) : defaultVolunteerForm)
  }

  const eventCommittees =
    events.find((e) => e.id === form.eventId)?.committees ?? []
  const selectedCommittee = eventCommittees.find((c) => c.id === form.committeeId)
  const committeeRoles = selectedCommittee?.roles ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateVolunteer(volunteer!.id, form)
      : await createVolunteer(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Volunteer updated" : "Volunteer added")
      router.push("/volunteers")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteVolunteer(volunteer!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Volunteer deleted")
      router.push("/volunteers")
    } else {
      toast.error(result.error)
    }
  }

  const approvalUrl =
    volunteer?.leaderApprovalToken
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/volunteer-approval/${volunteer.leaderApprovalToken}`
      : null

  async function copyApprovalLink() {
    if (!approvalUrl) return
    await navigator.clipboard.writeText(approvalUrl)
    toast.success("Approval link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
      <div>
        <Link
          href="/volunteers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Volunteers
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? volunteer!.memberName : "New Volunteer"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Edit volunteer details and assignment."
              : "Register a member as a volunteer."}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          <Button type="submit" form="volunteer-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add volunteer"}
          </Button>
        </div>
      </div>

      <form id="volunteer-form" onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Member */}
        <div className="space-y-2">
          <Label htmlFor="member">
            Member <span className="text-destructive">*</span>
          </Label>
          <Select value={form.memberId} onValueChange={(v) => set("memberId", v)}>
            <SelectTrigger id="member">
              <SelectValue placeholder="Select member" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Event */}
        <div className="space-y-2">
          <Label htmlFor="event">
            Event <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.eventId}
            onValueChange={(v) => {
              set("eventId", v)
              set("committeeId", "")
              set("preferredRoleId", "")
              set("assignedRoleId", "")
            }}
          >
            <SelectTrigger id="event">
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Committee (cascades from event) */}
        {form.eventId && (
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
                {eventCommittees.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No committees — add them in event settings
                  </SelectItem>
                ) : (
                  eventCommittees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Preferred role (cascades from committee) */}
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

        {/* Assigned role (edit mode only) */}
        {isEdit && form.committeeId && (
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

        {/* Status (edit mode only) */}
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status || "Pending"}
              onValueChange={(v) =>
                set("status", v as "Pending" | "Confirmed" | "Rejected")
              }
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
        )}

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

      {/* Leader approval section (edit mode) */}
      {isEdit && (
        <div className="max-w-2xl rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Leader Approval</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Share this link with the volunteer&apos;s Small Group leader to request
                approval.
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[volunteer!.status]}>{volunteer!.status}</Badge>
          </div>

          {approvalUrl && (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                {approvalUrl}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyApprovalLink}>
                <IconCopy className="size-4" />
                Copy link
              </Button>
            </div>
          )}

          {volunteer?.leaderNotes && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Leader&apos;s notes</p>
              <p className="text-sm">{volunteer.leaderNotes}</p>
            </div>
          )}
        </div>
      )}

      <MobileFormActions
        formId="volunteer-form"
        isEdit={isEdit}
        saving={saving}
        saveLabel={isEdit ? "Save changes" : "Add volunteer"}
        onRevert={handleRevert}
        onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{volunteer?.memberName}</span> as a volunteer?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
