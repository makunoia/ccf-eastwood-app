"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createRegistrant,
  lookupMemberByMobile,
} from "@/app/(dashboard)/events/actions"

type Step = "form" | "confirm" | "done"

type FormValues = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  mobileNumber: string
}

type MatchedMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

const defaultForm: FormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  mobileNumber: "",
}

export function RegistrationForm({ eventId }: { eventId: string }) {
  const [step, setStep] = React.useState<Step>("form")
  const [form, setForm] = React.useState<FormValues>(defaultForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [matchedMember, setMatchedMember] = React.useState<MatchedMember | null>(null)

  function set(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    // Check for existing member by mobile
    const match = await lookupMemberByMobile(form.mobileNumber)
    setSubmitting(false)

    if (match) {
      setMatchedMember(match)
      setStep("confirm")
    } else {
      await register(null)
    }
  }

  async function register(confirmedMemberId: string | null) {
    setSubmitting(true)
    const result = await createRegistrant(eventId, form, confirmedMemberId)
    setSubmitting(false)

    if (result.success) {
      setStep("done")
    } else {
      toast.error(result.error)
    }
  }

  if (step === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex size-14 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-7 text-green-600" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">You&apos;re registered!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll see you at the event.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "confirm" && matchedMember) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Is this you?</CardTitle>
          <CardDescription>
            We found an existing record matching your mobile number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">
              {matchedMember.firstName} {matchedMember.lastName}
            </p>
            {matchedMember.email && (
              <p className="text-muted-foreground">{matchedMember.email}</p>
            )}
            {matchedMember.phone && (
              <p className="text-muted-foreground">{matchedMember.phone}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => register(matchedMember.id)}
              disabled={submitting}
            >
              {submitting ? "Registering…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => register(null)}
              disabled={submitting}
            >
              {submitting ? "Registering…" : "That's not me"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register</CardTitle>
        <CardDescription>Fill in your details to register for this event.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Juan"
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
                placeholder="dela Cruz"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              placeholder="Jun"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobileNumber">
              Mobile Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mobileNumber"
              type="tel"
              value={form.mobileNumber}
              onChange={(e) => set("mobileNumber", e.target.value)}
              placeholder="+63 917 123 4567"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="juan@email.com"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Checking…" : "Register"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
