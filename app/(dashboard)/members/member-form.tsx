"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { DetailPageHeader } from "@/components/detail-page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { YearInput } from "@/components/ui/year-input"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { OptionalPhonePHInput } from "@/components/ui/optional-phone-ph-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  defaultMemberForm,
  type MemberFormValues,
} from "@/lib/validations/member"
import { createMember, updateMember, deleteMember } from "./actions"
import { type MemberRow } from "./columns"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"
import { MemberGroupStepper } from "./[id]/member-group-stepper"

type Props = {
  member?: MemberRow
  groupStatus?: "Member" | "Timothy" | "Leader" | null
  eventHistory?: React.ReactNode
  activityHistory?: React.ReactNode
  smallGroups?: React.ReactNode
}

function toFormValues(member: MemberRow): MemberFormValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    nickname: member.nickname ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    address: member.address ?? "",
    dateJoined: member.dateJoined,
    notes: member.notes ?? "",
    lifeStageId: member.lifeStageId ?? "",
    gender: member.gender ?? "",
    language: member.language,
    birthMonth: member.birthMonth != null ? String(member.birthMonth) : "",
    birthYear: member.birthYear != null ? String(member.birthYear) : "",
    workCity: member.workCity ?? "",
    workIndustry: member.workIndustry ?? "",
    meetingPreference: member.meetingPreference ?? "",
  }
}

export function MemberForm({ member, groupStatus, eventHistory, activityHistory, smallGroups }: Props) {
  const router = useRouter()
  const isEdit = !!member
  const [form, setForm] = React.useState<MemberFormValues>(
    () => member ? toFormValues(member) : defaultMemberForm
  )
  const [noPhone, setNoPhone] = React.useState(() => !!member && !member.phone)
  const [noEmail, setNoEmail] = React.useState(() => !!member && !member.email)
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("profile")
  const [dirty, setDirty] = React.useState(false)
  const [pendingTab, setPendingTab] = React.useState<string | null>(null)

  const { prev, next } = useListNavigation(member?.id ?? "", "memberListIds")
  const preferredFirstName = isEdit ? (member!.nickname?.trim() || member!.firstName) : ""

  function set<K extends keyof MemberFormValues>(field: K, value: MemberFormValues[K]) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(member ? toFormValues(member) : defaultMemberForm)
    setNoPhone(!!member && !member.phone)
    setNoEmail(!!member && !member.email)
    setDirty(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateMember(member!.id, form)
      : await createMember(form)

    setSaving(false)

    if (result.success) {
      setDirty(false)
      toast.success(isEdit ? "Member updated" : "Member added")
      if (!isEdit) router.push("/members")
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

  function handleTabChange(newTab: string) {
    if (dirty && activeTab === "profile" && newTab !== "profile") {
      setPendingTab(newTab)
      return
    }
    setActiveTab(newTab)
  }

  const hasTabs = isEdit && (eventHistory || activityHistory || smallGroups)

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col gap-0">
      {isEdit && (
        <BreadcrumbOverride
          href={`/members/${member!.id}`}
          label={`${preferredFirstName} ${member!.lastName}`}
        />
      )}

      {/* ── Page header ──────────────────────────────────────────────── */}
      <DetailPageHeader
        initials={isEdit ? `${preferredFirstName[0]}${member!.lastName[0]}` : undefined}
        title={isEdit ? `${preferredFirstName} ${member!.lastName}` : "New Member"}
        subtitle={
          isEdit ? (
            <p className="text-sm text-muted-foreground">
              Member since{" "}
              {new Date(member!.dateJoined + "T00:00:00").toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Fill in the details to add a new member.
            </p>
          )
        }
        prevHref={isEdit ? (prev ? `/members/${prev}` : null) : undefined}
        nextHref={isEdit ? (next ? `/members/${next}` : null) : undefined}
        action={
          !isEdit ? (
            <Button type="submit" form="member-form" disabled={saving}>
              {saving ? "Adding…" : "Add Member"}
            </Button>
          ) : dirty && activeTab === "profile" ? (
            <Button type="submit" form="member-form" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null
        }
        status={
          isEdit && groupStatus ? (
            <MemberGroupStepper status={groupStatus} />
          ) : undefined
        }
        tabs={
          hasTabs ? (
            <TabsList variant="line" className="mt-1">
              <TabsTrigger value="profile" className="after:-bottom-px">Profile</TabsTrigger>
              {smallGroups && (
                <TabsTrigger value="small-groups" className="after:-bottom-px">Small Groups</TabsTrigger>
              )}
              {eventHistory && (
                <TabsTrigger value="events" className="after:-bottom-px">Events</TabsTrigger>
              )}
              {activityHistory && (
                <TabsTrigger value="activity" className="after:-bottom-px">Activity</TabsTrigger>
              )}
            </TabsList>
          ) : undefined
        }
      />

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <TabsContent value="profile" className="mt-0 p-6 pb-24 sm:pb-6">
        <form
          id="member-form"
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-8"
        >
          {/* Personal Info */}
          <section className="space-y-4">
            <h3 className="type-label text-muted-foreground">
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

            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                value={form.nickname ?? ""}
                onChange={(e) => set("nickname", e.target.value)}
                placeholder="Jimmy"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <OptionalEmailInput
                  id="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="james@email.com"
                  noEmail={noEmail}
                  onNoEmailChange={setNoEmail}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <OptionalPhonePHInput
                  id="phone"
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  noNumber={noPhone}
                  onNoNumberChange={setNoPhone}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => set("gender", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
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

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Birth Month</Label>
                <Select
                  value={form.birthMonth}
                  onValueChange={(v) => set("birthMonth", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthYear">Birth Year</Label>
                <YearInput
                  id="birthYear"
                  value={form.birthYear}
                  onChange={(val) => set("birthYear", val)}
                />
              </div>
            </div>
          </section>

          {/* Notes */}
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
        </form>

        {/* Danger zone */}
        {isEdit && (
          <div className="mt-12 max-w-2xl border-t pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Delete member</p>
                <p className="text-xs text-muted-foreground">
                  Permanently removes this record. This cannot be undone.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={saving}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </TabsContent>

      {isEdit && smallGroups && (
        <TabsContent value="small-groups" className="mt-0 p-6">
          {smallGroups}
        </TabsContent>
      )}

      {isEdit && eventHistory && (
        <TabsContent value="events" className="mt-0 max-w-2xl p-6">
          {eventHistory}
        </TabsContent>
      )}

      {isEdit && activityHistory && (
        <TabsContent value="activity" className="mt-0 max-w-2xl p-6">
          {activityHistory}
        </TabsContent>
      )}

      {/* Mobile actions */}
      {activeTab === "profile" && (!isEdit || dirty) && (
        <MobileFormActions
          formId="member-form"
          isEdit={isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save changes" : "Add Member"}
          onRevert={handleRevert}
          onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
        />
      )}

      {/* Unsaved changes guard */}
      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => { if (!open) setPendingTab(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on the Profile tab. Save them first, or discard and continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTab(null)}>
              Stay and save
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleRevert()
                setActiveTab(pendingTab!)
                setPendingTab(null)
              }}
            >
              Discard and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </Tabs>
  )
}
