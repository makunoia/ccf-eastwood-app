"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconHeart } from "@tabler/icons-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { GroupTypeBadge } from "@/components/group-type-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { confirmCatchMechCoupleRequests } from "../../matching-actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { YearInput } from "@/components/ui/year-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { RegistrantGuestProfile } from "@/app/(event)/event/[id]/registrants/[registrantId]/registrant-profile"
import { CatchMechMatchSection, type CatchMechMatchSectionHandle } from "./catch-mech-match-section"
import { CatchMechActivityLog, type CatchMechActivityEntry } from "./catch-mech-activity-log"
import { CatchMechUndoButton } from "../../catch-mech-undo-button"
import { SLUG_CONFIG, type CatchMechSlug } from "../../status-slug"
import type { DeclineReason } from "@/app/generated/prisma/client"
import { DECLINE_REASON_LABELS } from "@/lib/decline-reason"

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

export type SpouseCardData = {
  name: string
  isGuest: boolean
  currentGroupId: string | null
  currentGroupName: string | null
  pendingRequest: { id: string; smallGroupId: string; smallGroupName: string } | null
}

type Props = {
  registrant: RegistrantData
  // smallGroup is null for a groupless decline — a Timothy who leads no group yet.
  request: { id: string; notes: string | null; declineReason: DeclineReason | null; smallGroupId: string | null; smallGroup: { id: string; name: string; groupType: "Regular" | "Couples"; leader: { firstName: string; lastName: string } | null } | null } | null
  status: CatchMechSlug
  eventId: string
  registrantId: string
  profileLink: string | null
  canViewSmallGroup: boolean
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
  spouseCard: SpouseCardData | null
}

function SpouseCard({
  spouse,
  eventId,
  request,
  status,
}: {
  spouse: SpouseCardData
  eventId: string
  request: Props["request"]
  status: CatchMechSlug
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  // "Confirm both" only when both halves are pending for the same Couples group
  const canConfirmBoth =
    status === "pending" &&
    request !== null &&
    request.smallGroup?.groupType === "Couples" &&
    spouse.pendingRequest !== null &&
    spouse.pendingRequest.smallGroupId === request.smallGroupId

  async function handleConfirmBoth() {
    if (!request || !spouse.pendingRequest) return
    setConfirming(true)
    const result = await confirmCatchMechCoupleRequests(
      eventId,
      request.id,
      spouse.pendingRequest.id
    )
    setConfirming(false)
    if (result.success) {
      toast.success("Both spouses confirmed into the group")
      setConfirmOpen(false)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-2 mb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <IconHeart className="size-4 text-rose-500" />
          Spouse
        </p>
        {canConfirmBoth && (
          <Button size="sm" onClick={() => setConfirmOpen(true)}>
            Confirm both
          </Button>
        )}
      </div>
      <p className="text-sm">
        <span className="font-medium">{spouse.name}</span>
        {spouse.isGuest && (
          <Badge variant="outline" className="ml-2">Guest</Badge>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {spouse.pendingRequest
          ? spouse.pendingRequest.smallGroupId === request?.smallGroupId
            ? "Also pending for this group"
            : `Pending for ${spouse.pendingRequest.smallGroupName}`
          : spouse.currentGroupName
            ? `Member of ${spouse.currentGroupName}`
            : "No DGroup or pending request"}
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm both spouses</DialogTitle>
            <DialogDescription>
              Confirm both pending requests into{" "}
              <span className="font-medium">{request?.smallGroup?.name}</span>? Guests
              are promoted to members, and both requests are marked Confirmed on
              behalf of the group leader.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirming}>
              Cancel
            </Button>
            <Button onClick={handleConfirmBoth} disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm both"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-6 max-w-2xl w-full">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/event/${props.eventId}/catch-mech`} className="hover:text-foreground transition-colors">
          Catch Mech
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <Link href={`/event/${props.eventId}/catch-mech/${props.status}`} className="hover:text-foreground transition-colors">
          {SLUG_CONFIG[props.status].label}
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium truncate">{props.name}</span>
      </nav>

      {/* Name + type badge + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="type-headline truncate">{props.name}</h2>
          {props.registrant.memberId ? (
            <Badge variant="secondary" className="shrink-0">Member</Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">Guest</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
      <div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="small-group">DGroup</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
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

          <TabsContent value="small-group" className="mt-4">
            {props.spouseCard && (
              <SpouseCard
                spouse={props.spouseCard}
                eventId={props.eventId}
                request={props.request}
                status={props.status}
              />
            )}
            {props.status === "confirmed" && props.request?.smallGroup && (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Member of this group</p>
                  {props.requestId && (
                    <CatchMechUndoButton
                      requestId={props.requestId}
                      eventId={props.eventId}
                      decision="Confirmed"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {props.canViewSmallGroup ? (
                    <Link
                      href={`/small-groups/${props.request.smallGroup.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {props.request.smallGroup.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{props.request.smallGroup.name}</span>
                  )}
                  <GroupTypeBadge groupType={props.request.smallGroup.groupType} />
                </div>
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
                <div className="flex items-center gap-2 text-sm">
                  {props.canViewSmallGroup ? (
                    <Link
                      href={`/small-groups/${props.request.smallGroup.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {props.request.smallGroup.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{props.request.smallGroup.name}</span>
                  )}
                  <GroupTypeBadge groupType={props.request.smallGroup.groupType} />
                </div>
                {props.request.smallGroup.leader && (
                  <p className="text-sm text-muted-foreground">
                    Led by {props.request.smallGroup.leader.firstName} {props.request.smallGroup.leader.lastName}
                  </p>
                )}
              </div>
            )}

            {/* Both declined slugs land here — without in-small-group this tab would
                render completely blank for that bucket (the match section below is
                deliberately rejected-only). */}
            {(props.status === "rejected" || props.status === "in-small-group") &&
              props.request?.declineReason && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1 mb-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {props.status === "in-small-group"
                      ? "Already in a DGroup"
                      : "Declined by leader"}
                  </p>
                  {props.requestId && (
                    <CatchMechUndoButton
                      requestId={props.requestId}
                      eventId={props.eventId}
                      decision="Rejected"
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {DECLINE_REASON_LABELS[props.request.declineReason]}
                  {props.request.declineReason === "Others" && props.request.notes
                    ? ` — ${props.request.notes}`
                    : null}
                </p>
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
              <p className="text-sm text-muted-foreground">No DGroup assigned.</p>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <CatchMechActivityLog
              entries={props.activityEntries}
              requestId={props.requestId}
              canViewSmallGroup={props.canViewSmallGroup}
            />
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </div>
  )
}
