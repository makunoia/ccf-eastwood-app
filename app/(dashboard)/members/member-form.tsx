"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconTrash } from "@tabler/icons-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  defaultMemberForm,
  type MemberFormValues,
} from "@/lib/validations/member"
import { createMember, updateMember, deleteMember } from "./actions"
import { type MemberRow } from "./columns"

type Props = {
  lifeStages: { id: string; name: string }[]
  member?: MemberRow
}

function toFormValues(member: MemberRow): MemberFormValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email ?? "",
    phone: member.phone ?? "",
    address: member.address ?? "",
    dateJoined: member.dateJoined,
    notes: member.notes ?? "",
    lifeStageId: member.lifeStageId ?? "",
    gender: member.gender ?? "",
    language: member.language ?? "",
    birthDate: member.birthDate ?? "",
    workCity: member.workCity ?? "",
    workIndustry: member.workIndustry ?? "",
    meetingPreference: member.meetingPreference ?? "",
  }
}

export function MemberForm({ lifeStages, member }: Props) {
  const router = useRouter()
  const isEdit = !!member
  const [form, setForm] = React.useState<MemberFormValues>(
    member ? toFormValues(member) : defaultMemberForm
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set(field: keyof MemberFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateMember(member!.id, form)
      : await createMember(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Member updated" : "Member added")
      router.push("/members")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteMember(member!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Member deleted")
      router.push("/members")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Members
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit
              ? `${member!.firstName} ${member!.lastName}`
              : "New Member"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Edit member details below."
              : "Fill in the details to add a new member."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              <IconTrash className="size-4" />
              Delete
            </Button>
          )}
          <Button type="submit" form="member-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add member"}
          </Button>
        </div>
      </div>

      <form
        id="member-form"
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-8"
      >
        {/* Personal Info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Personal Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="James"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Reyes"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="james@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+63 917 123 4567"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="12 Mapagmahal St, Quezon City"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateJoined">
                Date Joined <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dateJoined"
                type="date"
                value={form.dateJoined}
                onChange={(e) => set("dateJoined", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">Birth Date</Label>
              <Input
                id="birthDate"
                type="date"
                value={form.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Profile */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Profile
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lifeStage">Life Stage</Label>
              <Select
                value={form.lifeStageId}
                onValueChange={(v) => set("lifeStageId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="lifeStage">
                  <SelectValue placeholder="Select life stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {lifeStages.map((ls) => (
                    <SelectItem key={ls.id} value={ls.id}>
                      {ls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => set("gender", v === "none" ? "" : v)}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Primary Language</Label>
            <Input
              id="language"
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              placeholder="Filipino"
            />
          </div>
        </section>

        {/* Matching Info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Matching Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workCity">Work / Home City</Label>
              <Input
                id="workCity"
                value={form.workCity}
                onChange={(e) => set("workCity", e.target.value)}
                placeholder="Quezon City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workIndustry">Industry</Label>
              <Input
                id="workIndustry"
                value={form.workIndustry}
                onChange={(e) => set("workIndustry", e.target.value)}
                placeholder="Technology"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetingPreference">Meeting Preference</Label>
            <Select
              value={form.meetingPreference}
              onValueChange={(v) =>
                set("meetingPreference", v === "none" ? "" : v)
              }
            >
              <SelectTrigger id="meetingPreference">
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                <SelectItem value="Online">Online</SelectItem>
                <SelectItem value="Hybrid">Hybrid</SelectItem>
                <SelectItem value="InPerson">In Person</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional information…"
              rows={3}
            />
          </div>
        </section>
      </form>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">
                {member?.firstName} {member?.lastName}
              </span>
              ? This action cannot be undone.
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
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
