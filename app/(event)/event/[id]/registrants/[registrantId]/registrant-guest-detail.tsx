"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { RegistrantNavHeader } from "./registrant-nav-header"
import { RegistrantGuestProfile } from "./registrant-profile"

type GuestData = React.ComponentProps<typeof RegistrantGuestProfile>["guest"]

type Props = {
  registrantId: string
  eventId: string
  initials: string
  title: string
  subtitle?: React.ReactNode
  guest: GuestData
  breakoutSlot: React.ReactNode
  deleteSlot: React.ReactNode
}

export function RegistrantGuestDetail({
  registrantId,
  eventId,
  initials,
  title,
  subtitle,
  guest,
  breakoutSlot,
  deleteSlot,
}: Props) {
  const revertRef = React.useRef<(() => void) | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  return (
    <>
      <RegistrantNavHeader
        registrantId={registrantId}
        eventId={eventId}
        initials={initials}
        title={title}
        subtitle={subtitle}
        action={
          dirty ? (
            <Button type="submit" form="registrant-guest-form" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="max-w-2xl space-y-8">
          {breakoutSlot}
          <RegistrantGuestProfile
            guest={guest}
            showViewProfileButton={false}
            onDirtyChange={setDirty}
            onSavingChange={setSaving}
            revertRef={revertRef}
          />
          {deleteSlot}
        </div>
      </div>

      {dirty && (
        <MobileFormActions
          formId="registrant-guest-form"
          isEdit
          saving={saving}
          saveLabel="Save changes"
          onRevert={() => revertRef.current?.()}
        />
      )}
    </>
  )
}
