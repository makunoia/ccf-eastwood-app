"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { YearInput } from "@/components/ui/year-input"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { type GuestFormValues } from "@/lib/validations/guest"
import { updateGuest } from "@/app/(dashboard)/guests/actions"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type GuestData = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  birthMonth: number | null
  birthYear: number | null
  // Matching fields — not shown in UI but preserved on save
  lifeStageId: string | null
  gender: string | null
  language: string[]
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
}

function toFormValues(guest: GuestData): GuestFormValues {
  return {
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email ?? "",
    phone: guest.phone ?? "",
    notes: guest.notes ?? "",
    birthMonth: guest.birthMonth != null ? String(guest.birthMonth) : "",
    birthYear: guest.birthYear != null ? String(guest.birthYear) : "",
    lifeStageId: guest.lifeStageId ?? "",
    gender: guest.gender ?? "",
    language: guest.language,
    workCity: guest.workCity ?? "",
    workIndustry: guest.workIndustry ?? "",
    meetingPreference: guest.meetingPreference ?? "",
  }
}

export function RegistrantGuestProfile({ guest, showViewProfileButton = true, formRef }: { guest: GuestData; showViewProfileButton?: boolean; formRef?: React.RefObject<HTMLFormElement | null> }) {
  const [form, setForm] = React.useState<GuestFormValues>(() => toFormValues(guest))
  const [saving, setSaving] = React.useState(false)

  function set<K extends keyof GuestFormValues>(field: K, value: GuestFormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await updateGuest(guest.id, form)
    setSaving(false)
    if (result.success) {
      toast.success("Guest updated")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Profile</h3>
      <form ref={formRef} id="registrant-guest-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rg-firstName">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rg-firstName"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rg-lastName">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rg-lastName"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rg-email">Email</Label>
            <Input
              id="rg-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="maria@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rg-phone">Phone</Label>
            <PhonePHInput
              id="rg-phone"
              value={form.phone}
              onChange={(v) => set("phone", v)}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Birth Month</Label>
            <Select value={form.birthMonth} onValueChange={(v) => set("birthMonth", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rg-birthYear">Birth Year</Label>
            <YearInput
              id="rg-birthYear"
              value={form.birthYear}
              onChange={(val) => set("birthYear", val)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Gender</Label>
          <div className="flex gap-3">
            {["Male", "Female"].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("gender", form.gender === g ? "" : g)}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  form.gender === g
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rg-notes">Notes</Label>
          <Textarea
            id="rg-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Any additional information…"
            rows={3}
          />
        </div>

        {showViewProfileButton && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </form>
    </section>
  )
}
