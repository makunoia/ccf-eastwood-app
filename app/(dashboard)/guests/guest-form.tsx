"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DetailPageHeader } from "@/components/detail-page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"

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
import { Badge } from "@/components/ui/badge"
import {
  defaultGuestForm,
  type GuestFormValues,
} from "@/lib/validations/guest"
import { createGuest, updateGuest, deleteGuest } from "./actions"
import { GuestPipelineStepper } from "./guest-pipeline-stepper"
import type { GuestPipelineStatus } from "@/lib/guest-utils"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { useListNavigation } from "@/lib/hooks/use-list-navigation"

type GuestDetail = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  lifeStageId: string | null
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  memberId: string | null
}

type SourceEvent = {
  id: string
  name: string
  date: Date
}

type Props = {
  guest?: GuestDetail
  sourceEvent?: SourceEvent | null
  eventHistory?: React.ReactNode
  activityHistory?: React.ReactNode
  matchSection?: React.ReactNode
  pipelineStatus?: GuestPipelineStatus
}

function toFormValues(guest: GuestDetail): GuestFormValues {
  return {
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email ?? "",
    phone: guest.phone ?? "",
    notes: guest.notes ?? "",
    lifeStageId: guest.lifeStageId ?? "",
    gender: guest.gender ?? "",
    language: guest.language,
    birthMonth: guest.birthMonth != null ? String(guest.birthMonth) : "",
    birthYear: guest.birthYear != null ? String(guest.birthYear) : "",
    workCity: guest.workCity ?? "",
    workIndustry: guest.workIndustry ?? "",
    meetingPreference: guest.meetingPreference ?? "",
  }
}

export function GuestForm({ guest, sourceEvent, eventHistory, activityHistory, matchSection, pipelineStatus }: Props) {
  const router = useRouter()
  const isEdit = !!guest
  const isPromoted = !!guest?.memberId
  const [form, setForm] = React.useState<GuestFormValues>(
    () => guest ? toFormValues(guest) : defaultGuestForm
  )
  const [noPhone, setNoPhone] = React.useState(() => !!guest && !guest.phone)
  const [noEmail, setNoEmail] = React.useState(() => !!guest && !guest.email)
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("profile")
  const [dirty, setDirty] = React.useState(false)
  const [pendingTab, setPendingTab] = React.useState<string | null>(null)

  const { prev, next } = useListNavigation(guest?.id ?? "", "guestListIds")

  function set<K extends keyof GuestFormValues>(field: K, value: GuestFormValues[K]) {
    setDirty(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(guest ? toFormValues(guest) : defaultGuestForm)
    setNoPhone(!!guest && !guest.phone)
    setNoEmail(!!guest && !guest.email)
    setDirty(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = isEdit
      ? await updateGuest(guest!.id, form)
      : await createGuest(form)
    setSaving(false)
    if (result.success) {
      setDirty(false)
      toast.success(isEdit ? "Guest updated" : "Guest added")
      if (!isEdit) router.push("/guests")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    if (!guest) return
    setDeleting(true)
    const result = await deleteGuest(guest.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Guest deleted")
      router.push("/guests")
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

  const hasTabs = isEdit && (matchSection || eventHistory || activityHistory)

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col gap-0">
      {isEdit && (
        <BreadcrumbOverride
          href={`/guests/${guest!.id}`}
          label={`${guest!.firstName} ${guest!.lastName}`}
        />
      )}

      {/* ── Page header ──────────────────────────────────────────────── */}
      <DetailPageHeader
        initials={isEdit ? `${guest!.firstName[0]}${guest!.lastName[0]}` : undefined}
        title={isEdit ? `${guest!.firstName} ${guest!.lastName}` : "New Guest"}
        subtitle={
          isEdit && sourceEvent ? (
            <p className="text-sm text-muted-foreground">
              First attended{" "}
              <Link
                href={`/event/${sourceEvent.id}`}
                className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors text-foreground"
              >
                {sourceEvent.name}
              </Link>
              {" on "}
              {sourceEvent.date.toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
          ) : !isEdit ? (
            <p className="text-sm text-muted-foreground">
              Fill in the details to add a new guest.
            </p>
          ) : null
        }
        prevHref={isEdit ? (prev ? `/guests/${prev}` : null) : undefined}
        nextHref={isEdit ? (next ? `/guests/${next}` : null) : undefined}
        action={
          !isEdit ? (
            <Button type="submit" form="guest-form" disabled={saving}>
              {saving ? "Adding…" : "Add Guest"}
            </Button>
          ) : dirty && activeTab === "profile" && !isPromoted ? (
            <Button type="submit" form="guest-form" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null
        }
        status={
          isEdit && pipelineStatus ? (
            <div className="space-y-3">
              <GuestPipelineStepper status={pipelineStatus} />
              {isPromoted && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200 max-w-xl">
                  <Badge variant="secondary" className="shrink-0">Promoted</Badge>
                  <span>
                    This guest is now a member — profile fields are locked.{" "}
                    <Link
                      href={`/members/${guest!.memberId}`}
                      className="font-medium underline underline-offset-2"
                    >
                      View member profile →
                    </Link>
                  </span>
                </div>
              )}
            </div>
          ) : undefined
        }
        tabs={
          hasTabs ? (
            <TabsList variant="line" className="mt-1">
              <TabsTrigger value="profile" className="after:-bottom-px">Profile</TabsTrigger>
              {matchSection && (
                <TabsTrigger value="small-group" className="after:-bottom-px">Small Group</TabsTrigger>
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
          id="guest-form"
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
                    placeholder="Maria"
                    required
                    disabled={isPromoted}
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
                    placeholder="Santos"
                    required
                    disabled={isPromoted}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <OptionalEmailInput
                    id="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="maria@email.com"
                    noEmail={noEmail}
                    onNoEmailChange={setNoEmail}
                    disabled={isPromoted}
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
                    disabled={isPromoted}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => set("gender", v === "none" ? "" : v)}
                  disabled={isPromoted}
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

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Birth Month</Label>
                  <Select
                    value={form.birthMonth}
                    onValueChange={(v) => set("birthMonth", v)}
                    disabled={isPromoted}
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
                    disabled={isPromoted}
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
                disabled={isPromoted}
              />
            </div>
          </form>

          {/* Danger zone */}
          {isEdit && !isPromoted && (
            <div className="mt-12 max-w-2xl border-t pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Delete guest</p>
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

      {isEdit && matchSection && (
        <TabsContent value="small-group" className="mt-0 p-6">
          {matchSection}
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

      {!isPromoted && activeTab === "profile" && (!isEdit || dirty) && (
        <MobileFormActions
          formId="guest-form"
          isEdit={isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save changes" : "Add Guest"}
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
            <DialogTitle>Delete guest</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">
                {guest?.firstName} {guest?.lastName}
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
