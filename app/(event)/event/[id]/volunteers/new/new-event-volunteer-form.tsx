"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { DetailPageHeader } from "@/components/detail-page-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PersonCombobox } from "@/components/ui/person-combobox"
import { Textarea } from "@/components/ui/textarea"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { createEventVolunteer } from "../[volunteerId]/actions"

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

type FormState = {
  memberId: string
  committeeId: string
  preferredRoleId: string
  notes: string
}

type Props = {
  eventId: string
  members: { id: string; firstName: string; lastName: string }[]
  committees: Committee[]
}

const defaultForm: FormState = { memberId: "", committeeId: "", preferredRoleId: "", notes: "" }

export function NewEventVolunteerForm({ eventId, members, committees }: Props) {
  const router = useRouter()
  const [form, setForm] = React.useState<FormState>(defaultForm)
  const [saving, setSaving] = React.useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectedCommittee = committees.find((c) => c.id === form.committeeId)
  const committeeRoles = selectedCommittee?.roles ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await createEventVolunteer({
      eventId,
      memberId: form.memberId,
      committeeId: form.committeeId,
      preferredRoleId: form.preferredRoleId,
      notes: form.notes,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Volunteer added")
      router.push(`/event/${eventId}/volunteers`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-0">
      <DetailPageHeader
        title="New Volunteer"
        subtitle={
          <p className="text-sm text-muted-foreground">Register a member as a volunteer.</p>
        }
        action={
          <Button type="submit" form="new-event-volunteer-form" disabled={saving}>
            {saving ? "Saving…" : "Add volunteer"}
          </Button>
        }
      />

      <div className="p-6 pb-24 sm:pb-6">
        <form id="new-event-volunteer-form" onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="space-y-2">
            <Label htmlFor="member">
              Member <span className="text-destructive">*</span>
            </Label>
            <PersonCombobox
              id="member"
              options={members.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
              value={form.memberId}
              onValueChange={(v) => set("memberId", v)}
              placeholder="Select member"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="committee">
              Committee <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.committeeId}
              onValueChange={(v) => {
                set("committeeId", v)
                set("preferredRoleId", "")
              }}
            >
              <SelectTrigger id="committee">
                <SelectValue placeholder="Select committee" />
              </SelectTrigger>
              <SelectContent>
                {committees.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No committees — add them in event settings
                  </SelectItem>
                ) : (
                  committees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

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
      </div>

      <MobileFormActions
        formId="new-event-volunteer-form"
        isEdit={false}
        saving={saving}
        saveLabel="Add volunteer"
        onRevert={() => setForm(defaultForm)}
      />
    </div>
  )
}
