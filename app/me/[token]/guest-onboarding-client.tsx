"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconUserCircle, IconUsers } from "@tabler/icons-react"
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
import { declareLeaderAndJoin } from "./actions"
import {
  LeaderGroupPicker,
  SATELLITE_OPTIONS,
  type LeaderOption,
  type UpwardScope,
} from "./portal-shared"

/**
 * The one question a guest is asked before the portal opens up to them.
 *
 * It is a whole screen rather than a dialog because it is the only thing on it:
 * answering promotes them to a Member, and the next render is the full portal.
 */
export function GuestOnboardingClient({
  token,
  guest,
  leaderOptions,
}: {
  token: string
  guest: {
    firstName: string
    nickname: string | null
    claimedGroupId: string | null
    claimedSatellite: string | null
  }
  leaderOptions: LeaderOption[]
}) {
  const router = useRouter()
  const displayName = guest.nickname || guest.firstName

  // Prefilled from whatever they already told us at check-in or registration, so
  // the common case is a confirmation rather than a fresh answer.
  const claimedLeaderId =
    leaderOptions.find((l) => l.groups.some((g) => g.id === guest.claimedGroupId))?.id ?? ""

  const [scope, setScope] = React.useState<UpwardScope>(
    guest.claimedSatellite ? "satellite" : "eastwood"
  )
  const [satellite, setSatellite] = React.useState(guest.claimedSatellite ?? "")
  const [leaderId, setLeaderId] = React.useState(claimedLeaderId)
  const [groupId, setGroupId] = React.useState(
    claimedLeaderId ? (guest.claimedGroupId ?? "") : ""
  )
  const [submitting, setSubmitting] = React.useState(false)

  const canSubmit = scope === "satellite" ? Boolean(satellite) : Boolean(groupId)

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const result = await declareLeaderAndJoin(
      token,
      scope === "satellite"
        ? { scope: "satellite", satellite }
        : { scope: "eastwood", groupId }
    )
    if (!result.success) {
      setSubmitting(false)
      toast.error(result.error)
      return
    }
    toast.success("Thanks — that's saved")
    // Their guest link is spent; the portal continues under their member token.
    router.replace(`/me/${result.data.token}`)
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="rounded-2xl border bg-background px-5 py-6 shadow-sm sm:px-7">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <IconUserCircle className="size-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                CCF Eastwood
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                Hi, {displayName}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                One question before we get started.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-8 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Who is your DGroup leader?</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              We ask this first so we know where you belong. Once it&apos;s saved you
              can add the DGroups you lead.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border bg-background p-5 shadow-sm">
            <div className="space-y-2">
              <Label>Where is your DGroup?</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as UpwardScope)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eastwood">Here at CCF Eastwood</SelectItem>
                  <SelectItem value="satellite">
                    My leader is from another CCF satellite
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "satellite" ? (
              <div className="space-y-2">
                <Label>CCF satellite</Label>
                <PersonCombobox
                  options={SATELLITE_OPTIONS}
                  value={satellite}
                  onValueChange={setSatellite}
                  placeholder="Select a CCF satellite"
                  searchPlaceholder="Search satellites…"
                  emptyText="No satellite found."
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  There&apos;s no request to send — your leader is outside CCF
                  Eastwood, so there&apos;s no DGroup here to link.
                </p>
              </div>
            ) : (
              <>
                <LeaderGroupPicker
                  leaderOptions={leaderOptions}
                  selectedLeaderId={leaderId}
                  onLeaderChange={setLeaderId}
                  selectedGroupId={groupId}
                  onGroupChange={setGroupId}
                />
                <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                  <IconUsers className="mt-0.5 size-3.5 shrink-0" />
                  Your request goes to that leader to confirm. You can carry on in
                  the meantime.
                </p>
              </>
            )}

            <Button
              className="w-full"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Saving…" : "Continue"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
