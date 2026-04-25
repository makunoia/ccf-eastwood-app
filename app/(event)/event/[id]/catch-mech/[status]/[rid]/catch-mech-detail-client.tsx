"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { YearInput } from "@/components/ui/year-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { RegistrantGuestProfile } from "@/app/(event)/event/[id]/registrants/[registrantId]/registrant-profile"
import { CatchMechMatchSection, type CatchMechMatchSectionHandle } from "./catch-mech-match-section"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type MemberData = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  address: string | null
  dateJoined: Date | null
  notes: string | null
  birthMonth: number | null
  birthYear: number | null
}

type GuestData = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  birthMonth: number | null
  birthYear: number | null
  lifeStageId: string | null
  gender: string | null
  language: string[]
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
}

type RegistrantData = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  mobileNumber: string | null
  email: string | null
  guest: GuestData | null
  member: MemberData | null
}

type Props = {
  registrant: RegistrantData
  request: { smallGroupId: string; smallGroup: { id: string; name: string; leader: { firstName: string; lastName: string } } } | null
  status: "confirmed" | "rejected" | "pending"
  eventId: string
  registrantId: string
  profileLink: string | null
  name: string
  initialPrefs: {
    lifeStageId: string
    language: string[]
    meetingPreference: string
    workCity: string
    workIndustry: string
  }
  lifeStages: { id: string; name: string }[]
}

function MemberReadOnly({ member, memberId: _memberId }: { member: MemberData; memberId: string }) {
  const birthMonthName = member.birthMonth ? MONTHS[member.birthMonth - 1] : null
  const dateJoinedStr = member.dateJoined
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(member.dateJoined)
    : null

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Profile</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input value={member.firstName} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Last Name</Label>
            <Input value={member.lastName} readOnly />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={member.email ?? ""} placeholder="—" readOnly />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={member.phone ?? ""} placeholder="—" readOnly />
          </div>
        </div>
        {member.address && (
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={member.address} readOnly />
          </div>
        )}
        {dateJoinedStr && (
          <div className="space-y-2">
            <Label>Date Joined</Label>
            <Input value={dateJoinedStr} readOnly />
          </div>
        )}
        {(birthMonthName || member.birthYear) && (
          <div className="grid sm:grid-cols-2 gap-4">
            {birthMonthName && (
              <div className="space-y-2">
                <Label>Birth Month</Label>
                <Input value={birthMonthName} readOnly />
              </div>
            )}
            {member.birthYear && (
              <div className="space-y-2">
                <Label>Birth Year</Label>
                <YearInput value={String(member.birthYear)} readOnly />
              </div>
            )}
          </div>
        )}
        {member.notes && (
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={member.notes} readOnly rows={3} />
          </div>
        )}
      </div>
    </section>
  )
}

const STATUS_LABEL: Record<"confirmed" | "rejected" | "pending", string> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}

export function CatchMechDetailClient(props: Props) {
  const formRef = React.useRef<HTMLFormElement>(null)
  const matchSectionRef = React.useRef<CatchMechMatchSectionHandle>(null)
  const [activeTab, setActiveTab] = React.useState("details")
  const [saving, setSaving] = React.useState(false)

  const handleSaveClick = () => {
    if (activeTab === "small-group" && props.status === "rejected" && props.registrant.guest) {
      setSaving(true)
      void matchSectionRef.current?.save().finally(() => setSaving(false))
    } else if (formRef.current) {
      formRef.current.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href={`/event/${props.eventId}/catch-mech`} className="hover:text-foreground transition-colors">
          ← Catch Mech
        </Link>
        <span>/</span>
        <Link href={`/event/${props.eventId}/catch-mech/${props.status}`} className="hover:text-foreground transition-colors">
          {STATUS_LABEL[props.status]}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{props.name}</span>
      </nav>

      {/* Name + type badge + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{props.name}</h2>
          {props.registrant.memberId ? (
            <Badge variant="secondary">Member</Badge>
          ) : (
            <Badge variant="outline">Guest</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {props.registrant.guest && props.profileLink && (
            <Button variant="outline" asChild>
              <Link href={props.profileLink}>View full profile</Link>
            </Button>
          )}
          {props.registrant.guest && (
            <Button onClick={handleSaveClick} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl">
        <Tabs defaultValue="details" onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="small-group">Small Group</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {props.registrant.guest && (
              <RegistrantGuestProfile guest={props.registrant.guest} showViewProfileButton={false} formRef={formRef} />
            )}
            {props.registrant.member && (
              <MemberReadOnly
                member={props.registrant.member}
                memberId={props.registrant.member.id}
              />
            )}
            {!props.registrant.guest && !props.registrant.member && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Contact</h3>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Mobile</span>
                  <span>{props.registrant.mobileNumber ?? <span className="text-muted-foreground">—</span>}</span>
                  <span className="text-muted-foreground">Email</span>
                  <span>{props.registrant.email ?? <span className="text-muted-foreground">—</span>}</span>
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="small-group" className="mt-4">
            {props.status === "confirmed" && props.request?.smallGroup && (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Member of this group</p>
                <p className="text-sm">
                  <Link
                    href={`/small-groups/${props.request.smallGroup.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {props.request.smallGroup.name}
                  </Link>
                </p>
                {props.request.smallGroup.leader && (
                  <p className="text-sm text-muted-foreground">
                    Led by {props.request.smallGroup.leader.firstName} {props.request.smallGroup.leader.lastName}
                  </p>
                )}
              </div>
            )}

            {props.status === "pending" && props.request?.smallGroup && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium">Awaiting leader confirmation</p>
                <p className="text-sm">
                  <Link
                    href={`/small-groups/${props.request.smallGroup.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {props.request.smallGroup.name}
                  </Link>
                </p>
                {props.request.smallGroup.leader && (
                  <p className="text-sm text-muted-foreground">
                    Led by {props.request.smallGroup.leader.firstName} {props.request.smallGroup.leader.lastName}
                  </p>
                )}
              </div>
            )}

            {props.status === "rejected" && (
              <CatchMechMatchSection
                ref={matchSectionRef}
                registrantId={props.registrantId}
                eventId={props.eventId}
                guestId={props.registrant.guestId ?? ""}
                initialPrefs={props.initialPrefs}
                lifeStages={props.lifeStages}
              />
            )}

            {(props.status === "confirmed" || props.status === "pending") && !props.request?.smallGroup && (
              <p className="text-sm text-muted-foreground">No small group assigned.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
