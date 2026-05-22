"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { updateProfile } from "./actions"

type Props = {
  name: string
  email: string
}

export function ProfileForm({ name, email }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateProfile(value)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      router.refresh()
      toast.success("Profile updated")
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="name"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" value={email} disabled />
          <p className="text-xs text-muted-foreground">
            Contact your administrator to change your email address.
          </p>
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || value.trim() === name}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
