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
import { DetailPageHeader } from "@/components/detail-page-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"
import { RegistrantGuestProfile } from "@/app/(event)/event/[id]/registrants/[registrantId]/registrant-profile"
import { CatchMechMatchSection, type CatchMechMatchSectionHandle } from "./catch-mech-match-section"
import { CatchMechActivityLog, type CatchMechActivityEntry } from "./catch-mech-activity-log"

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
  request: { id: string; notes: string | null; smallGroupId: string; smallGroup: { id: string; name: string; leader: { firstName: string; lastName: string } } } | null
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
  initialTab?: "details" | "small-group"
  requestId: string | null
  activityEntries: CatchMechActivityEntry[]
}

function MemberReadOnly({ member, memberId: _memberId }: { member: MemberData; memberId: string }) {
  const birthMonthName = member.birthMonth ? MONTHS[member.birthMonth - 1] : null
  const dateJoinedStr = member.dateJoined
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(member.dateJoined)
    : null

  return (
    <section className="space-y-4">
      <h3 className="type-label text-muted-foreground">Profile</h3>
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

export function CatchMechDetailClient(props: Props) {
  const formRef = React.useRef<HTMLFormElement>(null)
  const matchSectionRef = React.useRef<CatchMechMatchSectionHandle>(null)
  const [activeTab, setActiveTab] = React.useState<string>(props.initialTab ?? "details")
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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col gap-0">
      <BreadcrumbOverride
        href={`/event/${props.eventId}/catch-mech/${props.status}/${props.registrantId}`}
        label={props.name}
      />

      <DetailPageHeader
        initials={props.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2)}
        title={props.name}
        subtitle={
          props.registrant.memberId ? (
            <Badge variant="secondary">Member</Badge>
          ) : (
            <Badge variant="outline">Guest</Badge>
          )
        }
        action={
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
        }
        tabs={
          <TabsList variant="line" className="mt-1">
            <TabsTrigger value="details" className="after:-bottom-px">Details</TabsTrigger>
            <TabsTrigger value="small-group" className="after:-bottom-px">Small Group</TabsTrigger>
            <TabsTrigger value="activity" className="after:-bottom-px">Activity</TabsTrigger>
          </TabsList>
        }
      />

      <TabsContent value="details" className="mt-0 p-6 max-w-2xl space-y-4">
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
            <h3 className="type-label text-muted-foreground">Contact</h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">Mobile</span>
              <span>{props.registrant.mobileNumber ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Email</span>
              <span>{props.registrant.email ?? <span className="text-muted-foreground">—</span>}</span>
            </div>
          </section>
        )}
      </TabsContent>

      <TabsContent value="small-group" className="mt-0 p-6 max-w-2xl">
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

      <TabsContent value="activity" className="mt-0 p-6 max-w-2xl">
        <CatchMechActivityLog
          entries={props.activityEntries}
          requestId={props.requestId}
        />
      </TabsContent>
    </Tabs>
  )
}
