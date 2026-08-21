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
import { createClusterVolunteer } from "@/app/(dashboard)/events/cluster-actions"

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

/** One ministry choice — the label a person recognises, the event id we file against. */
export type MinistryChoice = {
  eventId: string
  label: string
  committees: Committee[]
}

type FormState = {
  eventId: string
  memberId: string
  committeeId: string
  preferredRoleId: string
  notes: string
}

type Props = {
  clusterId: string
  clusterName: string
  ministries: MinistryChoice[]
  members: { id: string; firstName: string; lastName: string }[]
}

export function NewClusterVolunteerForm({
  clusterId,
  clusterName,
  ministries,
  members,
}: Props) {
  const router = useRouter()
  // A day this user can only write to one ministry of has nothing to ask: the
  // answer is preselected rather than presented as a one-option dropdown.
  const soleMinistry = ministries.length === 1 ? ministries[0].eventId : ""
  const defaultForm: FormState = {
    eventId: soleMinistry,
    memberId: "",
    committeeId: "",
    preferredRoleId: "",
    notes: "",
  }
  const [form, setForm] = React.useState<FormState>(defaultForm)
  const [saving, setSaving] = React.useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const chosenMinistry = ministries.find((m) => m.eventId === form.eventId)
  const committees = chosenMinistry?.committees ?? []
  const selectedCommittee = committees.find((c) => c.id === form.committeeId)
  const committeeRoles = selectedCommittee?.roles ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await createClusterVolunteer(clusterId, {
      eventId: form.eventId,
      memberId: form.memberId,
      committeeId: form.committeeId,
      preferredRoleId: form.preferredRoleId,
      notes: form.notes,
    })
    setSaving(false)
    if (result.success) {
      // "Reused" is the ordinary case for a ministry regular, and saying so is
      // the difference between an admin trusting the screen and re-adding
      // someone who was already there.
      toast.success(
        result.data.reused
          ? `Added to this day's team — their ${result.data.eventName} sign-up was reused`
          : "Volunteer added",
      )
      router.push(`/cluster/${clusterId}/volunteers`)
    } else {
      toast.error(result.error)
    }
  }

  if (ministries.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No ministries to add to</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This day has no events you can add volunteers to.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-0">
      <DetailPageHeader
        title="New Volunteer"
        subtitle={
          <p className="text-sm text-muted-foreground">
            Add a member to {clusterName}&apos;s serving team.
          </p>
        }
        action={
          <Button type="submit" form="new-cluster-volunteer-form" disabled={saving}>
            {saving ? "Saving…" : "Add volunteer"}
          </Button>
        }
      />

      <div className="p-6 pb-24 sm:pb-6">
        <form
          id="new-cluster-volunteer-form"
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-6"
        >
          {ministries.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="ministry">
                Ministry <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.eventId}
                onValueChange={(v) => {
                  set("eventId", v)
                  set("committeeId", "")
                  set("preferredRoleId", "")
                }}
              >
                <SelectTrigger id="ministry">
                  <SelectValue placeholder="Select ministry" />
                </SelectTrigger>
                <SelectContent>
                  {ministries.map((m) => (
                    <SelectItem key={m.eventId} value={m.eventId}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which ministry they&apos;re serving with. The sign-up is filed under
                that ministry&apos;s event.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="member">
              Member <span className="text-destructive">*</span>
            </Label>
            <PersonCombobox
              id="member"
              options={members.map((m) => ({
                value: m.id,
                label: `${m.firstName} ${m.lastName}`,
              }))}
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
              disabled={!form.eventId}
              onValueChange={(v) => {
                set("committeeId", v)
                set("preferredRoleId", "")
              }}
            >
              <SelectTrigger id="committee">
                <SelectValue
                  placeholder={form.eventId ? "Select committee" : "Choose a ministry first"}
                />
              </SelectTrigger>
              <SelectContent>
                {committees.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No committees — add them in {chosenMinistry?.label ?? "the event"}&apos;s
                    settings
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
        formId="new-cluster-volunteer-form"
        isEdit={false}
        saving={saving}
        saveLabel="Add volunteer"
        onRevert={() => setForm(defaultForm)}
      />
    </div>
  )
}
