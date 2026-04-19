"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
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
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { MultiSelect } from "@/components/ui/multi-select"
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
import { MobileFormActions } from "@/components/mobile-form-actions"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"

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

type Props = {
  lifeStages: { id: string; name: string }[]
  guest?: GuestDetail
  eventHistory?: React.ReactNode
  matchSection?: React.ReactNode
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

export function GuestForm({ lifeStages, guest, eventHistory, matchSection }: Props) {
  const router = useRouter()
  const isEdit = !!guest
  const isPromoted = !!guest?.memberId
  const initialForm = React.useRef<GuestFormValues>(
    guest ? toFormValues(guest) : defaultGuestForm
  )
  const [form, setForm] = React.useState<GuestFormValues>(initialForm.current)
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set<K extends keyof GuestFormValues>(field: K, value: GuestFormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(initialForm.current)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = isEdit
      ? await updateGuest(guest!.id, form)
      : await createGuest(form)
    setSaving(false)
    if (result.success) {
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

  const hasTabs = isEdit && (matchSection || eventHistory)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
      <div>
        <Link
          href="/guests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Guests
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? `${guest!.firstName} ${guest!.lastName}` : "New Guest"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Edit guest details below." : "Fill in the details to add a new guest."}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isEdit && !isPromoted && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          {isEdit ? (
            <Button type="submit" form="guest-form" disabled={saving || isPromoted}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <Button type="submit" form="guest-form" disabled={saving}>
              {saving ? "Adding…" : "Add Guest"}
            </Button>
          )}
        </div>
      </div>

      {isPromoted && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Badge variant="secondary" className="shrink-0">Promoted</Badge>
          <span>
            This guest is now a member.{" "}
            <Link
              href={`/members/${guest!.memberId}`}
              className="font-medium underline underline-offset-2"
            >
              View member profile →
            </Link>
          </span>
        </div>
      )}

      <Tabs defaultValue="profile" className="flex flex-col gap-4">
        {hasTabs && (
          <TabsList className="w-fit">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {matchSection && (
              <TabsTrigger value="small-group">Small Group</TabsTrigger>
            )}
            {eventHistory && (
              <TabsTrigger value="events">Events</TabsTrigger>
            )}
          </TabsList>
        )}

        <TabsContent value="profile" className="mt-0">
          <form
            id="guest-form"
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
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="maria@email.com"
                    disabled={isPromoted}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <PhonePHInput
                    id="phone"
                    value={form.phone}
                    onChange={(v) => set("phone", v)}
                    disabled={isPromoted}
                  />
                </div>
              </div>

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
                <Input
                  id="birthYear"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                  value={form.birthYear}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    set("birthYear", val);
                  }}
                  disabled={isPromoted}
                />
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
                    disabled={isPromoted}
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
                    disabled={isPromoted}
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
                <Label>Primary Language</Label>
                <MultiSelect
                  options={LANGUAGE_OPTIONS}
                  value={form.language}
                  onChange={(v) => set("language", v)}
                  placeholder="Select language(s)"
                  disabled={isPromoted}
                />
              </div>
            </section>

            {/* Matching Information */}
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Matching Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workCity">Work / Home City</Label>
                  <Select
                    value={form.workCity || "_none"}
                    onValueChange={(v) => set("workCity", v === "_none" ? "" : v)}
                    disabled={isPromoted}
                  >
                    <SelectTrigger id="workCity">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No preference</SelectItem>
                      {CITY_OPTIONS.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workIndustry">Industry</Label>
                  <Input
                    id="workIndustry"
                    value={form.workIndustry}
                    onChange={(e) => set("workIndustry", e.target.value)}
                    placeholder="Technology"
                    disabled={isPromoted}
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
                  disabled={isPromoted}
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
                  disabled={isPromoted}
                />
              </div>
            </section>
          </form>
        </TabsContent>

        {isEdit && matchSection && (
          <TabsContent value="small-group" className="mt-0">
            {matchSection}
          </TabsContent>
        )}

        {isEdit && eventHistory && (
          <TabsContent value="events" className="mt-0 max-w-2xl">
            {eventHistory}
          </TabsContent>
        )}
      </Tabs>

      {!isPromoted && (
        <MobileFormActions
          formId="guest-form"
          isEdit={isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save changes" : "Add Guest"}
          onRevert={handleRevert}
          onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
        />
      )}

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
    </div>
  )
}
